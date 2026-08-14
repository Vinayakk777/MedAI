import { db, consentRecordsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { ConsentInput } from "./types";

export class ConsentManager {
  async grantConsent(input: ConsentInput): Promise<string> {
    // Revoke any existing active consent of this type
    await db.update(consentRecordsTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(consentRecordsTable.patientUserId, input.patientUserId),
        eq(consentRecordsTable.consentType, input.consentType),
        eq(consentRecordsTable.status, "granted"),
      ));

    const [saved] = await db.insert(consentRecordsTable).values({
      patientUserId: input.patientUserId,
      consentType: input.consentType,
      status: "granted",
      expiresAt: input.expiresAt,
      grantedBy: input.grantedBy,
      metadata: input.metadata,
    }).returning();

    return saved.id;
  }

  async revokeConsent(consentId: string): Promise<void> {
    await db.update(consentRecordsTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(consentRecordsTable.id, consentId));
  }

  async checkConsent(patientUserId: string, consentType: string): Promise<boolean> {
    const [active] = await db.select()
      .from(consentRecordsTable)
      .where(and(
        eq(consentRecordsTable.patientUserId, patientUserId),
        eq(consentRecordsTable.consentType, consentType),
        eq(consentRecordsTable.status, "granted"),
      ))
      .orderBy(desc(consentRecordsTable.grantedAt))
      .limit(1);

    if (!active) return false;
    if (active.expiresAt && active.expiresAt < new Date()) return false;
    return true;
  }

  async getPatientConsents(patientUserId: string) {
    return db.select()
      .from(consentRecordsTable)
      .where(eq(consentRecordsTable.patientUserId, patientUserId))
      .orderBy(desc(consentRecordsTable.grantedAt));
  }

  async getConsentSummary(patientUserId: string) {
    const consents = await this.getPatientConsents(patientUserId);

    return {
      treatment: consents.some((c) => c.consentType === "treatment" && c.status === "granted"),
      research: consents.some((c) => c.consentType === "research" && c.status === "granted"),
      dataSharing: consents.some((c) => c.consentType === "data_sharing" && c.status === "granted"),
      fhirExport: consents.some((c) => c.consentType === "fhir_export" && c.status === "granted"),
      telemedicine: consents.some((c) => c.consentType === "telemedicine" && c.status === "granted"),
      all: consents,
    };
  }
}
