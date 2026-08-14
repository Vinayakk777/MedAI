import { db, docClinicalSummariesTable, docUploadsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { ClinicalSummary } from "./types";

export class ClinicalSummarizer {
  async generateSummary(
    userId: string, documentIds: string[], conversationHistory?: string
  ): Promise<ClinicalSummary> {
    const docs = await db.select().from(docUploadsTable)
      .where(inArray(docUploadsTable.id, documentIds));

    const findings: string[] = [];
    const recommendations: string[] = [];
    let medicationDetails = "No medication data extracted.";
    let abnormalCount = 0;
    let totalLabs = 0;

    for (const doc of docs) {
      if (doc.aiSummary) {
        findings.push(`${doc.title || doc.fileName}: ${doc.aiSummary}`);
      }
      if (doc.documentType) {
        findings.push(`Document type: ${doc.documentType.replace(/_/g, " ")} — ${doc.fileName}`);
      }
    }

    if (conversationHistory) {
      const symptomMatch = conversationHistory.match(/(?:symptom|complaint|concern)[^.]*\.[^.]*\./gi);
      if (symptomMatch) findings.push(`Reported symptoms: ${symptomMatch.join("; ")}`);
    }

    const physicianSummary = this.buildPhysicianSummary(docs, findings, conversationHistory);
    const patientSummary = this.buildPatientSummary(findings, abnormalCount, totalLabs);

    const summary: ClinicalSummary = {
      physicianSummary,
      patientSummary,
      keyFindings: findings.slice(0, 10),
      recommendations: [
        "Review all results with your primary healthcare provider.",
        "Bring these reports to your next medical appointment.",
        ...recommendations,
      ],
      medicationSummary: {
        active: 0,
        changes: 0,
        issues: 0,
        details: medicationDetails,
      },
    };

    await db.insert(docClinicalSummariesTable).values({
      userId,
      documentIds,
      physicianSummary,
      patientSummary,
      keyFindings: summary.keyFindings as any,
      recommendations: summary.recommendations as any,
      medicationSummary: summary.medicationSummary as any,
    });

    return summary;
  }

  private buildPhysicianSummary(docs: any[], findings: string[], history?: string): string {
    const parts: string[] = [];

    if (docs.length > 0) {
      const types = docs.map((d) => d.documentType?.replace(/_/g, " ") || "document").join(", ");
      parts.push(`Patient uploaded ${docs.length} medical document(s): ${types}.`);
    }

    if (findings.length > 0) {
      parts.push(`Key findings: ${findings.join("; ")}`);
    }

    if (history) {
      parts.push("Consultation context available — refer to conversation history for symptom details.");
    }

    parts.push("AI-generated summary for informational purposes. All clinical decisions should be made by the treating physician.");

    return parts.join("\n\n");
  }

  private buildPatientSummary(findings: string[], abnormalCount: number, totalLabs: number): string {
    const parts: string[] = [
      "This summary provides an overview of your uploaded medical documents and reports.",
      "The information presented here is for informational purposes only and is not a medical diagnosis.",
    ];

    if (abnormalCount > 0) {
      parts.push(`${abnormalCount} out of ${totalLabs} reviewed values are outside the normal range — these have been highlighted for your doctor's attention.`);
    }

    if (findings.length > 0) {
      parts.push("Your healthcare provider can explain what these results mean for your specific health situation.");
    }

    parts.push("Please discuss all results and findings with your doctor before making any decisions about your health.");

    return parts.join("\n\n");
  }

  async getSummary(documentId: string): Promise<ClinicalSummary | null> {
    const rows = await db.select().from(docClinicalSummariesTable)
      .where(eq(docClinicalSummariesTable.id, documentId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      physicianSummary: r.physicianSummary || "",
      patientSummary: r.patientSummary || "",
      keyFindings: (r.keyFindings as string[]) || [],
      recommendations: (r.recommendations as string[]) || [],
      medicationSummary: (r.medicationSummary as any) || { active: 0, changes: 0, issues: 0, details: "" },
      labTrendSummary: r.labTrendSummary || undefined,
    };
  }
}
