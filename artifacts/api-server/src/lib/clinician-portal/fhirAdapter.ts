import { db, fhirMappingsTable, fhirExportQueueTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { FHIRResourceType, FHIRMappingConfig, FHIRResource } from "./types";

export interface FHIRAdapter {
  readonly vendor: string;
  exportResource(resource: FHIRResource): Promise<{ success: boolean; remoteId?: string; error?: string }>;
  importResource(resourceType: string, remoteId: string): Promise<FHIRResource | null>;
  searchResources(resourceType: string, query: Record<string, string>): Promise<FHIRResource[]>;
}

// Generic FHIR client for standard REST APIs
class GenericFHIRClient implements FHIRAdapter {
  readonly vendor = "generic";
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.headers = {
      "Content-Type": "application/fhir+json",
      "Accept": "application/fhir+json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
  }

  async exportResource(resource: FHIRResource): Promise<{ success: boolean; remoteId?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/${resource.resourceType}`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(resource),
      });
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${await response.text()}` };
      }
      const result: any = await response.json();
      return { success: true, remoteId: result.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async importResource(resourceType: string, remoteId: string): Promise<FHIRResource | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${resourceType}/${remoteId}`, {
        headers: this.headers,
      });
      if (!response.ok) return null;
      return (await response.json()) as FHIRResource;
    } catch {
      return null;
    }
  }

  async searchResources(resourceType: string, query: Record<string, string>): Promise<FHIRResource[]> {
    const params = new URLSearchParams(query);
    try {
      const response = await fetch(`${this.baseUrl}/${resourceType}?${params}`, {
        headers: this.headers,
      });
      if (!response.ok) return [];
      const bundle: any = await response.json();
      return bundle.entry?.map((e: any) => e.resource) || [];
    } catch {
      return [];
    }
  }
}

export class FHIRService {
  private adapters = new Map<string, FHIRAdapter>();

  registerAdapter(vendor: string, adapter: FHIRAdapter): void {
    this.adapters.set(vendor, adapter);
  }

  getAdapter(vendor: string): FHIRAdapter | undefined {
    return this.adapters.get(vendor);
  }

  createGenericClient(baseUrl: string, apiKey?: string): GenericFHIRClient {
    return new GenericFHIRClient(baseUrl, apiKey);
  }

  async exportToFHIR(
    patientUserId: string,
    resourceType: FHIRResourceType,
    resourceData: FHIRResource,
    vendor = "generic",
  ): Promise<string> {
    const queueEntry = await db.insert(fhirExportQueueTable).values({
      patientUserId,
      resourceType,
      resourceData: resourceData as any,
      vendor,
      fhirVersion: "R4",
    }).returning();

    // Attempt immediate export if adapter is registered
    const adapter = this.adapters.get(vendor);
    if (adapter) {
      try {
        const result = await adapter.exportResource(resourceData);
        await db.update(fhirExportQueueTable)
          .set({
            status: result.success ? "completed" : "failed",
            exportedAt: new Date(),
            errorMessage: result.error,
          })
          .where(eq(fhirExportQueueTable.id, queueEntry[0].id));
      } catch (err) {
        await db.update(fhirExportQueueTable)
          .set({ status: "failed", errorMessage: String(err) })
          .where(eq(fhirExportQueueTable.id, queueEntry[0].id));
      }
    }

    return queueEntry[0].id;
  }

  async getExportQueue(patientUserId?: string, status?: string) {
    const conditions = [];
    if (patientUserId) conditions.push(eq(fhirExportQueueTable.patientUserId, patientUserId));
    if (status) conditions.push(eq(fhirExportQueueTable.status, status));

    return db.select()
      .from(fhirExportQueueTable)
      .where(and(...conditions))
      .orderBy(fhirExportQueueTable.createdAt);
  }

  async getMappings(resourceType?: string, vendor?: string) {
    const conditions = [];
    if (resourceType) conditions.push(eq(fhirMappingsTable.resourceType, resourceType));
    if (vendor) conditions.push(eq(fhirMappingsTable.vendor, vendor));

    return db.select()
      .from(fhirMappingsTable)
      .where(and(...conditions));
  }

  async createMapping(mapping: FHIRMappingConfig): Promise<string> {
    const [saved] = await db.insert(fhirMappingsTable).values({
      resourceType: mapping.resourceType,
      sourceField: mapping.sourceField,
      fhirPath: mapping.fhirPath,
      transform: mapping.transform,
      vendor: mapping.vendor,
    }).returning();
    return saved.id;
  }

  // Transform internal medical data to FHIR Patient resource
  toFHIRPatient(internal: Record<string, any>): FHIRResource {
    return {
      resourceType: "Patient",
      identifier: [{ system: "urn:medibot:patient", value: internal.userId }],
      name: [{ use: "official", family: internal.lastName, given: [internal.firstName] }],
      gender: internal.sex,
      birthDate: internal.dateOfBirth,
      telecom: internal.email ? [{ system: "email", value: internal.email }] : undefined,
    };
  }

  // Transform internal observation to FHIR Observation
  toFHIRObservation(internal: Record<string, any>): FHIRResource {
    return {
      resourceType: "Observation",
      status: "final",
      code: { coding: [{ system: "http://loinc.org", code: internal.loincCode, display: internal.testName }] },
      valueQuantity: {
        value: internal.value,
        unit: internal.unit,
      },
      effectiveDateTime: internal.date,
    };
  }

  // Transform internal consultation to FHIR Encounter
  toFHIREncounter(internal: Record<string, any>): FHIRResource {
    return {
      resourceType: "Encounter",
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
      subject: { reference: `Patient/${internal.patientUserId}` },
      period: { start: internal.createdAt },
      reasonCode: internal.chiefComplaint
        ? [{ text: internal.chiefComplaint }]
        : undefined,
    };
  }

  // Transform diagnosis to FHIR Condition
  toFHIRCondition(internal: Record<string, any>): FHIRResource {
    return {
      resourceType: "Condition",
      subject: { reference: `Patient/${internal.patientUserId}` },
      code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: internal.icdCode, display: internal.diagnosis }] },
      recordedDate: internal.date,
    };
  }
}
