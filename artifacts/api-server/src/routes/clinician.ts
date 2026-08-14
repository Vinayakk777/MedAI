import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { db, clinicianProfilesTable, patientAssignmentsTable, physicianNotesTable, aiConsultationReviewsTable, carePlansTable, followUpTasksTable, alertCenterTable, clinicianAuditLogsTable, fhirExportQueueTable, consentRecordsTable, ehrConnectionsTable, fhirMappingsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { ClinicianService } from "../lib/clinician-portal/clinicianService";
import { PhysicianNotesService } from "../lib/clinician-portal/physicianNotesService";
import { AIReviewService } from "../lib/clinician-portal/aiReviewService";
import { CarePlanService } from "../lib/clinician-portal/carePlanService";
import { ReferralService, AlertCenterService } from "../lib/clinician-portal/referralService";
import { FHIRService } from "../lib/clinician-portal/fhirAdapter";
import { AuditService } from "../lib/clinician-portal/auditService";
import { ConsentManager } from "../lib/clinician-portal/consentManager";
import { rbac } from "../lib/clinician-portal/rbac";
import type { UserRole } from "../lib/clinician-portal/types";

const router: IRouter = Router();

const clinicianService = new ClinicianService();
const notesService = new PhysicianNotesService();
const aiReviewService = new AIReviewService();
const carePlanService = new CarePlanService();
const referralService = new ReferralService();
const alertService = new AlertCenterService();
const fhirService = new FHIRService();
const auditService = new AuditService();
const consentManager = new ConsentManager();

async function getClinicianId(userId: string): Promise<string | null> {
  const profile = await clinicianService.getProfile(userId);
  return profile?.id || null;
}

async function requireClinician(req: AuthRequest, res: any, next: any) {
  const profile = await clinicianService.getProfile(req.userId);
  if (!profile || !profile.isActive) {
    res.status(403).json({ error: "Clinician profile not found or inactive" });
    return;
  }
  (req as any).clinicianProfile = profile;
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.clinicianProfile.role)) {
      res.status(403).json({ error: `Requires one of roles: ${roles.join(", ")}` });
      return;
    }
    next();
  };
}

// ─────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────

router.get("/clinician/dashboard", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const clinicianId = req.clinicianProfile.id;
    const role = req.clinicianProfile.role as UserRole;

    // Get patient count
    const [patientCount] = await db.select({ count: count() })
      .from(patientAssignmentsTable)
      .where(and(eq(patientAssignmentsTable.clinicianId, clinicianId), eq(patientAssignmentsTable.isActive, true)));

    // Get pending AI reviews
    const [pendingReviews] = await db.select({ count: count() })
      .from(aiConsultationReviewsTable)
      .where(eq(aiConsultationReviewsTable.isReviewed, false));

    // Get unread alerts
    const unreadAlerts = await alertService.getUnreadCount(clinicianId);

    // Get recent patients from assignments
    const assignments = await db.select()
      .from(patientAssignmentsTable)
      .where(and(eq(patientAssignmentsTable.clinicianId, clinicianId), eq(patientAssignmentsTable.isActive, true)))
      .orderBy(desc(patientAssignmentsTable.assignedAt))
      .limit(10);

    res.json({
      totalPatients: Number(patientCount.count),
      pendingConsultations: Number(pendingReviews.count),
      unreadAlerts,
      recentPatientIds: assignments.map((a) => a.patientUserId),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────

router.get("/clinician/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = await clinicianService.getProfile(req.userId);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(profile);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    await clinicianService.updateProfile(req.userId, req.body);
    res.json({ message: "Profile updated" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/clinician/profiles/search", requireAuth, async (req: AuthRequest, res) => {
  try {
    const query = req.query.q as string;
    const role = req.query.role as string;
    if (!query) { res.json([]); return; }
    const results = await clinicianService.searchClinicians(query, role);
    res.json(results);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  PATIENTS
// ─────────────────────────────────────────────

router.get("/clinician/patients", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const clinicianId = req.clinicianProfile.id;
    const patients = await clinicianService.getPatientsForClinician(clinicianId);
    res.json(patients);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/patients/assign", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const id = await clinicianService.assignPatient({
      clinicianId: req.clinicianProfile.id,
      patientUserId: req.body.patientUserId,
      relationship: req.body.relationship || "primary_care",
      notes: req.body.notes,
    });
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId: req.body.patientUserId, action: "assign_patient", resourceType: "patient_assignment", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/patients/unassign", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    await clinicianService.unassignPatient(req.clinicianProfile.id, req.body.patientUserId);
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId: req.body.patientUserId, action: "unassign_patient", resourceType: "patient_assignment" });
    res.json({ message: "Patient unassigned" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Medical Record ───

router.get("/clinician/patients/:patientUserId/record", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const patientUserId = req.params.patientUserId;

    // Gather consultations
    const consultations = await db.select()
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, patientUserId))
      .orderBy(desc(conversationsTable.createdAt))
      .limit(50);

    // Gather AI reviews
    const reviews = await aiReviewService.getReviewsForPatient(patientUserId);

    // Gather physician notes
    const notes = await notesService.getNotesForPatient(patientUserId);

    // Gather care plans
    const carePlans = await carePlanService.getCarePlansForPatient(patientUserId);

    // Gather referrals
    const referrals = await referralService.getReferralsForPatient(patientUserId);

    // Gather consent status
    const consentSummary = await consentManager.getConsentSummary(patientUserId);

    await auditService.record({
      clinicianId: req.clinicianProfile.id,
      patientUserId,
      action: "view_record",
      resourceType: "medical_record",
    });

    res.json({
      consultations,
      aiReviews: reviews,
      physicianNotes: notes,
      carePlans,
      referrals,
      consent: consentSummary,
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  AI CONSULTATION REVIEW
// ─────────────────────────────────────────────

router.get("/clinician/consultations/pending", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const pending = await aiReviewService.getPendingReviews(req.clinicianProfile.id);
    res.json(pending);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/clinician/consultations/:consultationId/review", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const reviews = await aiReviewService.getReviewsForConsultation(req.params.consultationId);
    res.json(reviews);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/consultations/review/:reviewId", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    await aiReviewService.clinicianReview(req.params.reviewId, req.clinicianProfile.id, req.body);
    await auditService.record({
      clinicianId: req.clinicianProfile.id,
      action: `review_consultation_${req.body.reviewStatus || "reviewed"}`,
      resourceType: "ai_consultation_review",
      resourceId: req.params.reviewId,
      details: { decision: req.body.reviewStatus, finalDiagnosis: req.body.finalDiagnosis },
    });
    res.json({ message: "Review recorded" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  PHYSICIAN NOTES (SOAP)
// ─────────────────────────────────────────────

router.get("/clinician/notes/patient/:patientUserId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const notes = await notesService.getNotesForPatient(req.params.patientUserId);
    res.json(notes);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/clinician/notes/:noteId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const note = await notesService.getNote(req.params.noteId);
    if (!note) { res.status(404).json({ error: "Not found" }); return; }
    res.json(note);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/notes", requireAuth, requireClinician, requireRole("doctor", "nurse", "admin"), async (req: any, res) => {
  try {
    const id = await notesService.createNote(req.clinicianProfile.id, req.body);
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId: req.body.patientUserId, action: "create_note", resourceType: "physician_note", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/notes/:noteId", requireAuth, requireClinician, requireRole("doctor", "nurse", "admin"), async (req: any, res) => {
  try {
    const id = await notesService.updateNote(req.params.noteId, req.clinicianProfile.id, req.body);
    await auditService.record({ clinicianId: req.clinicianProfile.id, action: "update_note", resourceType: "physician_note", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/notes/:noteId/finalize", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    await notesService.finalizeNote(req.params.noteId);
    await auditService.record({ clinicianId: req.clinicianProfile.id, action: "finalize_note", resourceType: "physician_note", resourceId: req.params.noteId });
    res.json({ message: "Note finalized" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  CARE PLANS
// ─────────────────────────────────────────────

router.get("/clinician/care-plans/patient/:patientUserId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const plans = await carePlanService.getCarePlansForPatient(req.params.patientUserId);
    res.json(plans);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/care-plans", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const id = await carePlanService.createCarePlan(req.clinicianProfile.id, req.body);
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId: req.body.patientUserId, action: "create_care_plan", resourceType: "care_plan", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/care-plans/:id", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    await carePlanService.updateCarePlan(req.params.id, req.body);
    res.json({ message: "Care plan updated" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/care-plans/:id/complete", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    await carePlanService.completeCarePlan(req.params.id);
    res.json({ message: "Care plan completed" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Follow-up Tasks ───

router.get("/clinician/tasks/patient/:patientUserId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const tasks = await carePlanService.getTasksForPatient(req.params.patientUserId);
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/tasks", requireAuth, requireClinician, requireRole("doctor", "nurse", "admin"), async (req: any, res) => {
  try {
    const id = await carePlanService.createTask(req.clinicianProfile.id, req.body);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/tasks/:id/complete", requireAuth, requireClinician, async (req: any, res) => {
  try {
    await carePlanService.completeTask(req.params.id);
    res.json({ message: "Task completed" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  REFERRALS
// ─────────────────────────────────────────────

router.get("/clinician/referrals/patient/:patientUserId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const refs = await referralService.getReferralsForPatient(req.params.patientUserId);
    res.json(refs);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/referrals", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const id = await referralService.createReferral({ ...req.body, referringClinicianId: req.clinicianProfile.id });
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId: req.body.patientUserId, action: "create_referral", resourceType: "referral", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/referrals/:id", requireAuth, requireClinician, async (req: any, res) => {
  try {
    await referralService.updateReferral(req.params.id, req.body);
    res.json({ message: "Referral updated" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  ALERTS
// ─────────────────────────────────────────────

router.get("/clinician/alerts", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const includeResolved = req.query.includeResolved === "true";
    const alerts = await alertService.getAlertsForClinician(req.clinicianProfile.id, includeResolved);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/alerts/:id/read", requireAuth, requireClinician, async (req: any, res) => {
  try {
    await alertService.markAsRead(req.params.id);
    res.json({ message: "Alert marked as read" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/alerts/:id/resolve", requireAuth, requireClinician, async (req: any, res) => {
  try {
    await alertService.resolveAlert(req.params.id);
    res.json({ message: "Alert resolved" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  FHIR / EHR
// ─────────────────────────────────────────────

router.get("/clinician/fhir/mappings", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const resourceType = req.query.resourceType as string;
    const vendor = req.query.vendor as string;
    const mappings = await fhirService.getMappings(resourceType, vendor);
    res.json(mappings);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/fhir/mappings", requireAuth, requireClinician, requireRole("admin"), async (req: any, res) => {
  try {
    const id = await fhirService.createMapping(req.body);
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/fhir/export", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const { patientUserId, resourceType, resourceData, vendor } = req.body;
    // Check consent
    const hasConsent = await consentManager.checkConsent(patientUserId, "fhir_export");
    if (!hasConsent) { res.status(403).json({ error: "Patient has not consented to FHIR data export" }); return; }

    const id = await fhirService.exportToFHIR(patientUserId, resourceType, resourceData, vendor);
    await auditService.record({ clinicianId: req.clinicianProfile.id, patientUserId, action: "export_fhir", resourceType: "fhir_export", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/clinician/fhir/exports", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const patientUserId = req.query.patientUserId as string;
    const status = req.query.status as string;
    const queue = await fhirService.getExportQueue(patientUserId, status);
    res.json(queue);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  CONSENT
// ─────────────────────────────────────────────

router.get("/clinician/consent/:patientUserId", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const summary = await consentManager.getConsentSummary(req.params.patientUserId);
    res.json(summary);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/consent/grant", requireAuth, requireClinician, async (req: any, res) => {
  try {
    const id = await consentManager.grantConsent({ ...req.body, grantedBy: req.clinicianProfile.id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/consent/:id/revoke", requireAuth, requireClinician, async (req: any, res) => {
  try {
    await consentManager.revokeConsent(req.params.id);
    res.json({ message: "Consent revoked" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  AUDIT LOGS
// ─────────────────────────────────────────────

router.get("/clinician/admin/audit-logs", requireAuth, requireClinician, requireRole("admin"), async (req: any, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const filters = {
      clinicianId: req.query.clinicianId as string,
      patientUserId: req.query.patientUserId as string,
      action: req.query.action as string,
      resourceType: req.query.resourceType as string,
    };
    const logs = await auditService.getAuditLogs(limit, offset, filters);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/clinician/admin/audit-logs/patient/:patientUserId", requireAuth, requireClinician, requireRole("doctor", "admin"), async (req: any, res) => {
  try {
    const logs = await auditService.getPatientAccessLog(req.params.patientUserId);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────
//  ADMIN: CLINICIAN MANAGEMENT
// ─────────────────────────────────────────────

router.get("/clinician/admin/clinicians", requireAuth, requireClinician, requireRole("admin"), async (req: any, res) => {
  try {
    const role = req.query.role as string;
    const clinicians = await clinicianService.getAllClinicians(role);
    res.json(clinicians);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/clinician/admin/clinicians", requireAuth, requireClinician, requireRole("admin"), async (req: any, res) => {
  try {
    const id = await clinicianService.createProfile(req.body);
    await auditService.record({ clinicianId: req.clinicianProfile.id, action: "create_clinician", resourceType: "clinician_profile", resourceId: id });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.put("/clinician/admin/clinicians/:userId", requireAuth, requireClinician, requireRole("admin"), async (req: any, res) => {
  try {
    await clinicianService.updateProfile(req.params.userId, req.body);
    res.json({ message: "Clinician updated" });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
