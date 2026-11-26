import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));
const auth = vi.hoisted(() => ({ userId: "clinician-user" as string | null }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

vi.mock("@clerk/express", () => ({
  getAuth: () => (auth.userId ? { userId: auth.userId } : null),
}));

import router from "../../src/routes/clinician";

const fake = () => dbHolder.mock.db.__fake;

const CLINICIAN_ID = "clin-a";
const OTHER_CLINICIAN_ID = "clin-b";

function seedClinician(userId = "clinician-user", id = CLINICIAN_ID, role = "doctor") {
  return fake().seed("clinicianProfiles", {
    id,
    userId,
    role,
    fullName: `Clinician ${id}`,
    isActive: true,
  })[0];
}

function assign(clinicianId: string, patientUserId: string) {
  return fake().seed("patientAssignments", {
    id: `assign-${clinicianId}-${patientUserId}`,
    clinicianId,
    patientUserId,
    isActive: true,
  })[0];
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  delete process.env.DEV_AUTH_USER_ID;
  delete process.env.ADMIN_TOKEN;
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  fake().clear();
  auth.userId = "clinician-user";
  seedClinician();
  assign(CLINICIAN_ID, "patient-a");
});

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // leave as text
  }
  return { status: res.status, text, body };
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

describe("clinician dashboard scoping", () => {
  it("counts only reviews for assigned patients", async () => {
    fake().seed("aiConsultationReviews", {
      id: "review-a",
      consultationId: "conv-a",
      patientUserId: "patient-a",
      isReviewed: false,
    });
    fake().seed("aiConsultationReviews", {
      id: "review-b",
      consultationId: "conv-b",
      patientUserId: "patient-b",
      isReviewed: false,
    });

    const res = await request("/clinician/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalPatients: 1, pendingConsultations: 1 });
  });
});

describe("clinician note assignment", () => {
  it("denies listing notes for an unassigned patient", async () => {
    const res = await request("/clinician/notes/patient/patient-b");

    expect(res.status).toBe(403);
  });

  it("denies reading a note for an unassigned patient", async () => {
    fake().seed("physicianNotes", {
      id: "note-b",
      patientUserId: "patient-b",
      clinicianId: OTHER_CLINICIAN_ID,
      version: 1,
    });

    const res = await request("/clinician/notes/note-b");

    expect(res.status).toBe(403);
  });

  it("denies creating a note for an unassigned patient", async () => {
    const res = await request(
      "/clinician/notes",
      jsonRequest("POST", { patientUserId: "patient-b", subjective: "synthetic" }),
    );

    expect(res.status).toBe(403);
    expect(fake().getRows("physicianNotes")).toHaveLength(0);
  });

  it("denies updating and finalizing another patient's note", async () => {
    fake().seed("physicianNotes", {
      id: "note-b",
      patientUserId: "patient-b",
      clinicianId: OTHER_CLINICIAN_ID,
      version: 1,
      isFinalized: false,
    });

    const update = await request(
      "/clinician/notes/note-b",
      jsonRequest("PUT", { assessment: "changed" }),
    );
    const finalize = await request("/clinician/notes/note-b/finalize", {
      method: "POST",
    });

    expect(update.status).toBe(403);
    expect(finalize.status).toBe(403);
    expect(fake().getRows("physicianNotes")[0].isFinalized).toBe(false);
  });

  it("allows an assigned clinician to create a note", async () => {
    const res = await request(
      "/clinician/notes",
      jsonRequest("POST", { patientUserId: "patient-a", subjective: "synthetic" }),
    );

    expect(res.status).toBe(200);
    expect(fake().getRows("physicianNotes")).toHaveLength(1);
  });
});

describe("clinician care plan and task assignment", () => {
  it("denies care plan access and mutation for an unassigned patient", async () => {
    fake().seed("carePlans", {
      id: "plan-b",
      patientUserId: "patient-b",
      clinicianId: OTHER_CLINICIAN_ID,
      title: "Synthetic plan",
    });

    const list = await request("/clinician/care-plans/patient/patient-b");
    const update = await request(
      "/clinician/care-plans/plan-b",
      jsonRequest("PUT", { title: "changed" }),
    );
    const complete = await request("/clinician/care-plans/plan-b/complete", {
      method: "POST",
    });

    expect(list.status).toBe(403);
    expect(update.status).toBe(403);
    expect(complete.status).toBe(403);
    expect(fake().getRows("carePlans")[0].status).toBeUndefined();
  });

  it("denies task access and completion for an unassigned patient", async () => {
    fake().seed("followUpTasks", {
      id: "task-b",
      patientUserId: "patient-b",
      clinicianId: OTHER_CLINICIAN_ID,
      title: "Synthetic task",
      status: "pending",
    });

    const list = await request("/clinician/tasks/patient/patient-b");
    const complete = await request("/clinician/tasks/task-b/complete", {
      method: "POST",
    });

    expect(list.status).toBe(403);
    expect(complete.status).toBe(403);
    expect(fake().getRows("followUpTasks")[0].status).toBe("pending");
  });
});

describe("clinician referral assignment", () => {
  it("denies referral access, creation, and update for an unassigned patient", async () => {
    fake().seed("clinReferrals", {
      id: "ref-b",
      patientUserId: "patient-b",
      referringClinicianId: OTHER_CLINICIAN_ID,
      specialty: "cardiology",
      reason: "synthetic",
      status: "pending",
    });

    const list = await request("/clinician/referrals/patient/patient-b");
    const create = await request(
      "/clinician/referrals",
      jsonRequest("POST", {
        patientUserId: "patient-b",
        specialty: "cardiology",
        reason: "synthetic",
      }),
    );
    const update = await request(
      "/clinician/referrals/ref-b",
      jsonRequest("PUT", { status: "accepted" }),
    );

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
    expect(update.status).toBe(403);
    expect(fake().getRows("clinReferrals")[0].status).toBe("pending");
  });
});

describe("clinician alert ownership", () => {
  it("denies reading or resolving another clinician's alert", async () => {
    fake().seed("alertCenter", {
      id: "alert-b",
      clinicianId: OTHER_CLINICIAN_ID,
      patientUserId: "patient-b",
      type: "high_risk",
      title: "Synthetic alert",
      isRead: false,
      isResolved: false,
    });

    const read = await request("/clinician/alerts/alert-b/read", { method: "PUT" });
    const resolve = await request("/clinician/alerts/alert-b/resolve", {
      method: "PUT",
    });

    expect(read.status).toBe(403);
    expect(resolve.status).toBe(403);
    expect(fake().getRows("alertCenter")[0].isResolved).toBe(false);
  });

  it("allows the owning clinician to resolve an alert", async () => {
    fake().seed("alertCenter", {
      id: "alert-a",
      clinicianId: CLINICIAN_ID,
      patientUserId: "patient-a",
      type: "high_risk",
      title: "Synthetic alert",
      isRead: false,
      isResolved: false,
    });

    const res = await request("/clinician/alerts/alert-a/resolve", { method: "PUT" });

    expect(res.status).toBe(200);
    expect(fake().getRows("alertCenter")[0].isResolved).toBe(true);
  });
});

describe("clinician consultation review assignment", () => {
  it("filters consultation reviews to assigned patients", async () => {
    fake().seed("aiConsultationReviews", {
      id: "review-a",
      consultationId: "conv-shared",
      patientUserId: "patient-a",
      isReviewed: false,
    });
    fake().seed("aiConsultationReviews", {
      id: "review-b",
      consultationId: "conv-shared",
      patientUserId: "patient-b",
      isReviewed: false,
    });

    const res = await request("/clinician/consultations/conv-shared/review");

    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual(["review-a"]);
  });

  it("denies reviewing an unassigned patient's consultation", async () => {
    fake().seed("aiConsultationReviews", {
      id: "review-b",
      consultationId: "conv-b",
      patientUserId: "patient-b",
      isReviewed: false,
    });

    const res = await request(
      "/clinician/consultations/review/review-b",
      jsonRequest("POST", { reviewStatus: "accepted" }),
    );

    expect(res.status).toBe(403);
    expect(fake().getRows("aiConsultationReviews")[0].isReviewed).toBe(false);
  });
});

describe("clinician consent assignment", () => {
  it("denies consent access, grant, and revoke for an unassigned patient", async () => {
    fake().seed("consentRecords", {
      id: "consent-b",
      patientUserId: "patient-b",
      consentType: "treatment",
      status: "granted",
    });

    const summary = await request("/clinician/consent/patient-b");
    const grant = await request(
      "/clinician/consent/grant",
      jsonRequest("POST", { patientUserId: "patient-b", consentType: "treatment" }),
    );
    const revoke = await request("/clinician/consent/consent-b/revoke", {
      method: "POST",
    });

    expect(summary.status).toBe(403);
    expect(grant.status).toBe(403);
    expect(revoke.status).toBe(403);
    expect(fake().getRows("consentRecords")).toHaveLength(1);
  });
});

describe("clinician FHIR export assignment", () => {
  it("denies export and export-queue access for an unassigned patient", async () => {
    fake().seed("fhirExportQueue", {
      id: "export-b",
      patientUserId: "patient-b",
      resourceType: "Patient",
      resourceData: {},
      status: "pending",
    });

    const exportRes = await request(
      "/clinician/fhir/export",
      jsonRequest("POST", {
        patientUserId: "patient-b",
        resourceType: "Patient",
        resourceData: {},
      }),
    );
    const queue = await request("/clinician/fhir/exports?patientUserId=patient-b");

    expect(exportRes.status).toBe(403);
    expect(queue.status).toBe(403);
    expect(fake().getRows("fhirExportQueue")).toHaveLength(1);
  });

  it("returns only exports for assigned patients when no patient filter is supplied", async () => {
    fake().seed("fhirExportQueue", {
      id: "export-a",
      patientUserId: "patient-a",
      resourceType: "Patient",
      resourceData: {},
      status: "pending",
    });
    fake().seed("fhirExportQueue", {
      id: "export-b",
      patientUserId: "patient-b",
      resourceType: "Patient",
      resourceData: {},
      status: "pending",
    });

    const res = await request("/clinician/fhir/exports");

    expect(res.status).toBe(200);
    expect(res.body.map((row: any) => row.id)).toEqual(["export-a"]);
  });
});

describe("clinician admin bypass", () => {
  it("allows an admin to read an unassigned patient's note", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");
    fake().seed("physicianNotes", {
      id: "note-b",
      patientUserId: "patient-b",
      clinicianId: OTHER_CLINICIAN_ID,
      version: 1,
      subjective: "synthetic",
    });

    const res = await request("/clinician/notes/note-b");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "note-b" });
  });
});

describe("clinician patient assignment administration", () => {
  function assignmentsFor(clinicianId: string, patientUserId: string) {
    return fake().getRows("patientAssignments").filter(
      (row) => row.clinicianId === clinicianId && row.patientUserId === patientUserId,
    );
  }

  it("denies a clinician self-assigning to an unassigned patient", async () => {
    const res = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: CLINICIAN_ID, patientUserId: "patient-new" }),
    );

    expect(res.status).toBe(403);
    expect(assignmentsFor(CLINICIAN_ID, "patient-new")).toHaveLength(0);
    expect(fake().getRows("patientAssignments")).toHaveLength(1);
  });

  it("denies a clinician assigning another clinician", async () => {
    seedClinician("clinician-c", "clin-c");

    const res = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: "clin-c", patientUserId: "patient-new" }),
    );

    expect(res.status).toBe(403);
    expect(assignmentsFor("clin-c", "patient-new")).toHaveLength(0);
    expect(fake().getRows("patientAssignments")).toHaveLength(1);
  });

  it("denies a clinician changing an existing assignment", async () => {
    const res = await request(
      "/clinician/patients/unassign",
      jsonRequest("POST", { clinicianId: CLINICIAN_ID, patientUserId: "patient-a" }),
    );

    expect(res.status).toBe(403);
    expect(fake().getRows("patientAssignments")[0].isActive).toBe(true);
  });

  it("allows an admin to assign a clinician to a patient", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");
    seedClinician("clinician-c", "clin-c");

    const res = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", {
        clinicianId: "clin-c",
        patientUserId: "patient-new",
        relationship: "consulting",
      }),
    );

    expect(res.status).toBe(200);
    expect(assignmentsFor("clin-c", "patient-new")).toEqual([
      expect.objectContaining({ isActive: true, relationship: "consulting" }),
    ]);

    // The audit entry records the admin as the actor, not the target clinician.
    expect(
      fake().getRows("clinicianAuditLogs").find((row) => row.action === "assign_patient"),
    ).toMatchObject({
      clinicianId: "admin-profile",
      patientUserId: "patient-new",
      resourceType: "patient_assignment",
    });
  });

  it("rejects assignment to an unknown or inactive clinician", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");
    fake().seed("clinicianProfiles", {
      id: "clin-inactive",
      userId: "clinician-inactive",
      role: "doctor",
      fullName: "Inactive Clinician",
      isActive: false,
    });

    const unknown = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: "clin-missing", patientUserId: "patient-new" }),
    );
    const inactive = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: "clin-inactive", patientUserId: "patient-new" }),
    );

    expect(unknown.status).toBe(404);
    expect(inactive.status).toBe(404);
    expect(assignmentsFor("clin-inactive", "patient-new")).toHaveLength(0);
    expect(fake().getRows("patientAssignments")).toHaveLength(1);
  });

  it("keeps an unassigned clinician denied after another clinician is assigned", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");
    seedClinician("clinician-c", "clin-c");

    const assigned = await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: "clin-c", patientUserId: "patient-new" }),
    );
    expect(assigned.status).toBe(200);

    // Back to the original clinician, who is not assigned to patient-new.
    auth.userId = "clinician-user";

    const record = await request("/clinician/patients/patient-new/record");
    const notes = await request("/clinician/notes/patient/patient-new");
    const tasks = await request("/clinician/tasks/patient/patient-new");

    expect(record.status).toBe(403);
    expect(notes.status).toBe(403);
    expect(tasks.status).toBe(403);
  });

  it("allows the newly assigned clinician to read that patient's record", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");
    seedClinician("clinician-c", "clin-c");

    await request(
      "/clinician/patients/assign",
      jsonRequest("POST", { clinicianId: "clin-c", patientUserId: "patient-new" }),
    );

    auth.userId = "clinician-c";
    const record = await request("/clinician/patients/patient-new/record");

    expect(record.status).toBe(200);
    expect(record.body).toMatchObject({ physicianNotes: [], carePlans: [], referrals: [] });
  });

  it("still allows the existing assigned clinician to access their own patient", async () => {
    const record = await request("/clinician/patients/patient-a/record");
    const notes = await request("/clinician/notes/patient/patient-a");
    const carePlans = await request("/clinician/care-plans/patient/patient-a");

    expect(record.status).toBe(200);
    expect(notes.status).toBe(200);
    expect(carePlans.status).toBe(200);
  });

  it("still denies access to an unrelated patient", async () => {
    const record = await request("/clinician/patients/patient-b/record");
    const notes = await request("/clinician/notes/patient/patient-b");

    expect(record.status).toBe(403);
    expect(notes.status).toBe(403);
  });

  it("allows an admin to unassign a clinician and removes access", async () => {
    auth.userId = "admin-user";
    seedClinician("admin-user", "admin-profile", "admin");

    const res = await request(
      "/clinician/patients/unassign",
      jsonRequest("POST", { clinicianId: CLINICIAN_ID, patientUserId: "patient-a" }),
    );

    expect(res.status).toBe(200);
    expect(fake().getRows("patientAssignments")[0].isActive).toBe(false);

    auth.userId = "clinician-user";
    const record = await request("/clinician/patients/patient-a/record");

    expect(record.status).toBe(403);
  });
});
