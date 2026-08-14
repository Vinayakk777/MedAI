import { db, docImageAnalysesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ImageAnalysisResult, ImageAnalysisFinding } from "./types";

const IMAGE_TYPE_PATTERNS: Record<string, RegExp[]> = {
  chest_xray: [/chest/i, /x-ray/i, /xray/i, /radiograph/i, /lung/i],
  dental_xray: [/dental/i, /tooth/i, /teeth/i, /panoramic/i, /orthopantomogram/i],
  skin_photograph: [/skin/i, /lesion/i, /rash/i, /mole/i, /dermatology/i, /melanoma/i],
  eye_photograph: [/eye/i, /retina/i, /fundus/i, /cornea/i, /ophthalmology/i],
  wound_image: [/wound/i, /ulcer/i, /burn/i, /laceration/i, /incision/i],
  ultrasound_report: [/ultrasound/i, /sonogram/i, /echocardiogram/i, /doppler/i],
  ecg_printout: [/ecg/i, /ekg/i, /electrocardiogram/i, /cardiac/i, /heart\s*rhythm/i],
};

export class ImageAnalyzer {
  async analyze(documentId: string, text: string, imageType?: string): Promise<ImageAnalysisResult> {
    const startTime = Date.now();
    const detectedType = imageType || this.detectImageType(text);

    const qualityScore = this.assessQuality(text);
    const completenessScore = this.assessCompleteness(text);
    const findings = this.identifyFindings(text, detectedType);
    const observations = findings.map((f) => f.observation);
    const limitations = this.identifyLimitations(text, detectedType, qualityScore);
    const overallConfidence = this.calculateOverallConfidence(findings, qualityScore);

    const result: ImageAnalysisResult = {
      documentId,
      imageType: detectedType,
      qualityScore,
      completenessScore,
      findings,
      observations,
      limitations,
      overallConfidence,
      processingTimeMs: Date.now() - startTime,
      isInformationalOnly: true,
    };

    await this.persist(documentId, result);
    return result;
  }

  private detectImageType(text: string): string {
    const scores: [string, number][] = Object.entries(IMAGE_TYPE_PATTERNS).map(([type, patterns]) => {
      const score = patterns.reduce((sum, p) => sum + (p.test(text) ? 1 : 0), 0);
      return [type, score];
    });
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][1] > 0 ? scores[0][0] : "other";
  }

  private assessQuality(text: string): number {
    let score = 0.8;
    if (/blurred|blurry|unclear|poor\s*quality|motion|artifact/i.test(text)) score -= 0.2;
    if (/overexposed|underexposed|too\s*dark|too\s*bright|overexposure/i.test(text)) score -= 0.15;
    if (/low\s*resolution|pixelated|grainy|noisy/i.test(text)) score -= 0.15;
    if (/obscured|occluded|partial|cut\s*off|truncated/i.test(text)) score -= 0.1;
    return Math.max(0.1, Math.round(score * 100) / 100);
  }

  private assessCompleteness(text: string): number {
    let score = 0.75;
    if (/full|complete|entire|whole|bilateral|both/i.test(text)) score += 0.15;
    if (/view|projection|position|labeled|annotated/i.test(text)) score += 0.1;
    return Math.min(1, Math.round(score * 100) / 100);
  }

  private identifyFindings(text: string, imageType: string): ImageAnalysisFinding[] {
    const findings: ImageAnalysisFinding[] = [];

    const qualityFindings: [RegExp, string][] = [
      [/blurred|blurry/i, "Image appears blurred, which may reduce diagnostic quality"],
      [/overexposed|too\s*bright/i, "Image appears overexposed — details may be lost in bright areas"],
      [/underexposed|too\s*dark/i, "Image appears underexposed — details may be lost in dark areas"],
      [/artifact/i, "Image contains artifacts that may obscure underlying structures"],
      [/low\s*resolution|pixelated/i, "Image resolution may be insufficient for detailed analysis"],
    ];

    for (const [pattern, observation] of qualityFindings) {
      if (pattern.test(text)) {
        findings.push({
          category: "quality_issue",
          observation,
          confidence: 0.7,
          isCritical: false,
        });
      }
    }

    if (imageType === "chest_xray") {
      if (/infiltrate|consolidation|opacity|pneumonia/i.test(text)) {
        findings.push({
          category: "abnormality_detected", observation: "Lung opacity detected — this may indicate infection, fluid, or other pathology. Requires clinical correlation.",
          confidence: 0.65, isCritical: true,
        });
      }
      if (/cardiomegaly|enlarged\s*cardiac|cardiothoracic/i.test(text)) {
        findings.push({
          category: "abnormality_detected", observation: "Cardiac silhouette appears enlarged — this may suggest cardiomegaly. Requires clinical correlation.",
          confidence: 0.6, isCritical: false,
        });
      }
    }

    if (imageType === "skin_photograph") {
      if (/asymmetric|irregular\s*border|multiple\s*colors|large\s*diameter/i.test(text)) {
        findings.push({
          category: "abnormality_detected", observation: "Skin lesion exhibits features that may require dermatologic evaluation (asymmetry, irregular borders, color variation, or large diameter).",
          confidence: 0.55, isCritical: false,
        });
      }
    }

    if (imageType === "wound_image") {
      if (/erythema|redness|swelling|edema|purulent|drainage|infection/i.test(text)) {
        findings.push({
          category: "abnormality_detected", observation: "Signs of possible inflammation or infection detected. Requires clinical evaluation.",
          confidence: 0.6, isCritical: true,
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        category: "normal_appearance",
        observation: "No obvious visual abnormalities detected based on available image information. This is not a definitive diagnosis.",
        confidence: 0.4,
        isCritical: false,
      });
    }

    return findings;
  }

  private identifyLimitations(text: string, imageType: string, qualityScore: number): string[] {
    const limitations: string[] = [
      "This analysis is based solely on the uploaded image and is NOT a diagnostic interpretation.",
      "AI-generated observations are informational only and should not replace evaluation by a qualified healthcare professional.",
      "Image quality and completeness affect the reliability of findings.",
    ];

    if (qualityScore < 0.5) {
      limitations.push("Image quality is low — findings may be unreliable.");
    }

    if (imageType === "ultrasound_report" || imageType === "ecg_printout") {
      limitations.push("Document interpretation is based on visible text/numbers rather than direct image analysis.");
    }

    return limitations;
  }

  private calculateOverallConfidence(findings: ImageAnalysisFinding[], qualityScore: number): number {
    if (findings.length === 0) return 0.2;
    const avgFindingConf = findings.reduce((s, f) => s + f.confidence, 0) / findings.length;
    return Math.round((avgFindingConf * 0.6 + qualityScore * 0.4) * 100) / 100;
  }

  private async persist(documentId: string, result: ImageAnalysisResult): Promise<void> {
    await db.insert(docImageAnalysesTable).values({
      documentId,
      imageType: result.imageType,
      qualityScore: result.qualityScore,
      completenessScore: result.completenessScore,
      findings: result.findings as any,
      observations: result.observations as any,
      limitations: result.limitations as any,
      overallConfidence: result.overallConfidence,
      processingTimeMs: result.processingTimeMs,
      isInformationalOnly: true,
    });
  }

  async getAnalysis(documentId: string): Promise<ImageAnalysisResult | null> {
    const rows = await db.select().from(docImageAnalysesTable)
      .where(eq(docImageAnalysesTable.documentId, documentId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      documentId: r.documentId,
      imageType: r.imageType,
      qualityScore: r.qualityScore || 0,
      completenessScore: r.completenessScore || 0,
      findings: (r.findings as any) || [],
      observations: (r.observations as any) || [],
      limitations: (r.limitations as any) || [],
      overallConfidence: r.overallConfidence || 0,
      processingTimeMs: r.processingTimeMs || 0,
      isInformationalOnly: r.isInformationalOnly ?? true,
    };
  }
}
