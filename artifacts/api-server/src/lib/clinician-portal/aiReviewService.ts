import { db, aiConsultationReviewsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { AIReviewInput, ClinicianReviewAction } from "./types";

export class AIReviewService {
  async recordAIReview(input: AIReviewInput): Promise<string> {
    const [saved] = await db.insert(aiConsultationReviewsTable).values({
      consultationId: input.consultationId,
      patientUserId: input.patientUserId,
      aiSummary: input.aiSummary,
      aiDifferentialDiagnoses: input.aiDifferentialDiagnoses,
      aiConfidenceScore: input.aiConfidenceScore,
      aiRecommendations: input.aiRecommendations,
    }).returning();
    return saved.id;
  }

  async clinicianReview(reviewId: string, clinicianId: string, action: ClinicianReviewAction): Promise<void> {
    await db.update(aiConsultationReviewsTable)
      .set({
        clinicianId,
        reviewStatus: action.reviewStatus,
        clinicianDecision: action.reviewStatus === "accepted" ? "accepted" : action.reviewStatus === "rejected" ? "rejected" : "modified",
        clinicianNotes: action.clinicianNotes,
        corrections: action.corrections,
        finalDiagnosis: action.finalDiagnosis,
        finalDiagnosisIcd: action.finalDiagnosisIcd,
        isReviewed: true,
        reviewedAt: new Date(),
      })
      .where(eq(aiConsultationReviewsTable.id, reviewId));
  }

  async getReview(reviewId: string) {
    const [review] = await db.select()
      .from(aiConsultationReviewsTable)
      .where(eq(aiConsultationReviewsTable.id, reviewId))
      .limit(1);
    return review || null;
  }

  async getReviewsForPatient(patientUserId: string) {
    return db.select()
      .from(aiConsultationReviewsTable)
      .where(eq(aiConsultationReviewsTable.patientUserId, patientUserId))
      .orderBy(desc(aiConsultationReviewsTable.createdAt));
  }

  async getReviewsForConsultation(consultationId: string) {
    return db.select()
      .from(aiConsultationReviewsTable)
      .where(eq(aiConsultationReviewsTable.consultationId, consultationId))
      .orderBy(desc(aiConsultationReviewsTable.createdAt));
  }

  async getPendingReviews(clinicianId: string) {
    return db.select()
      .from(aiConsultationReviewsTable)
      .where(and(
        eq(aiConsultationReviewsTable.isReviewed, false),
      ))
      .orderBy(desc(aiConsultationReviewsTable.createdAt));
  }

  async getReviewStats() {
    const all = await db.select().from(aiConsultationReviewsTable);

    return {
      total: all.length,
      pending: all.filter((r) => !r.isReviewed).length,
      accepted: all.filter((r) => r.clinicianDecision === "accepted").length,
      rejected: all.filter((r) => r.clinicianDecision === "rejected").length,
      modified: all.filter((r) => r.clinicianDecision === "modified").length,
      avgConfidence: all.length > 0
        ? all.reduce((s, r) => s + (r.aiConfidenceScore ?? 0), 0) / all.length
        : 0,
    };
  }
}
