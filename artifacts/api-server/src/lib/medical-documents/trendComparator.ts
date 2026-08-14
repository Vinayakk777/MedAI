import { db, docLabValuesTable, docTrendComparisonsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import type { TrendComparison, TrendSummary, TrendDirection, LabClassification } from "./types";

export class TrendComparator {
  async compare(documentId: string, userId: string, testNames: string[]): Promise<TrendSummary> {
    const comparisons: TrendComparison[] = [];

    for (const testName of testNames) {
      const values = await db.select().from(docLabValuesTable)
        .where(and(
          eq(docLabValuesTable.testName, testName),
        ))
        .orderBy(desc(docLabValuesTable.createdAt))
        .limit(20);

      if (values.length < 2) continue;

      const current = values[0];
      const previous = values.find((v, i) => i > 0 && v.id !== current.id) || values[1];

      const currNumeric = parseFloat(current.value);
      const prevNumeric = parseFloat(previous.value);

      if (isNaN(currNumeric) || isNaN(prevNumeric)) continue;

      const diff = currNumeric - prevNumeric;

      const comparison: TrendComparison = {
        testName: current.testName,
        currentValue: `${currNumeric} ${current.unit || ""}`.trim(),
        previousValue: `${prevNumeric} ${previous.unit || ""}`.trim(),
        currentClassification: this.normalizeClassification(current.classification as string),
        previousClassification: this.normalizeClassification(previous.classification as string),
        trend: this.determineTrend(current.classification as string, previous.classification as string, diff),
        unit: current.unit || undefined,
        absoluteChange: Math.round(diff * 100) / 100,
        percentChange: prevNumeric !== 0 ? Math.round((diff / prevNumeric) * 10000) / 100 : undefined,
        isSignificant: Math.abs(diff) > 0.1,
      };

      comparisons.push(comparison);

      await db.insert(docTrendComparisonsTable).values({
        userId,
        documentId,
        previousDocumentId: previous.documentId || undefined,
        testName: comparison.testName,
        currentValue: comparison.currentValue,
        previousValue: comparison.previousValue,
        currentClassification: comparison.currentClassification,
        previousClassification: comparison.previousClassification,
        trend: comparison.trend,
        unit: comparison.unit,
        absoluteChange: comparison.absoluteChange,
        percentChange: comparison.percentChange,
        isSignificant: comparison.isSignificant,
      });
    }

    const summary = this.generateSummary(comparisons);

    return {
      comparisons,
      improvingCount: comparisons.filter((c) => c.trend === "improving").length,
      worseningCount: comparisons.filter((c) => c.trend === "worsening").length,
      stableCount: comparisons.filter((c) => c.trend === "stable").length,
      newlyAbnormalCount: comparisons.filter((c) => c.trend === "newly_abnormal").length,
      summary,
    };
  }

  private normalizeClassification(cls: string): LabClassification {
    const valid: LabClassification[] = ["normal", "borderline", "high", "low", "critical_high", "critical_low"];
    return valid.includes(cls as LabClassification) ? cls as LabClassification : "normal";
  }

  private determineTrend(
    currentClass: string, previousClass: string, diff: number
  ): TrendDirection {
    if (currentClass === "normal" && previousClass !== "normal") return "improving";
    if (currentClass !== "normal" && previousClass === "normal") return "newly_abnormal";
    if (currentClass === previousClass) {
      if (["high", "critical_high"].includes(currentClass) && diff < 0) return "improving";
      if (["high", "critical_high"].includes(currentClass) && diff > 0) return "worsening";
      if (["low", "critical_low"].includes(currentClass) && diff > 0) return "improving";
      if (["low", "critical_low"].includes(currentClass) && diff < 0) return "worsening";
      return "stable";
    }
    if (["critical_high", "critical_low"].includes(currentClass)) return "worsening";
    if (["high", "low"].includes(currentClass) && previousClass === "normal") return "newly_abnormal";
    return diff > 0 ? "worsening" : "improving";
  }

  private generateSummary(comparisons: TrendComparison[]): string {
    if (comparisons.length === 0) return "No historical data available for comparison.";

    const parts: string[] = [];
    const improving = comparisons.filter((c) => c.trend === "improving");
    const worsening = comparisons.filter((c) => c.trend === "worsening");
    const abnormal = comparisons.filter((c) => c.trend === "newly_abnormal");

    if (improving.length > 0) {
      const names = improving.map((c) => c.testName.toLowerCase()).join(", ");
      parts.push(`Your ${names} have improved compared with previous results.`);
    }

    if (worsening.length > 0) {
      const names = worsening.map((c) => c.testName.toLowerCase()).join(", ");
      parts.push(`Your ${names} have changed in a direction that may require attention.`);
    }

    if (abnormal.length > 0) {
      const names = abnormal.map((c) => c.testName.toLowerCase()).join(", ");
      parts.push(`Newly abnormal results detected for ${names}.`);
    }

    const stable = comparisons.filter((c) => c.trend === "stable");
    if (stable.length > 0 && parts.length === 0) {
      const names = stable.map((c) => c.testName.toLowerCase()).join(", ");
      parts.push(`Your ${names} remain stable compared with previous results.`);
    }

    if (parts.length === 0) {
      parts.push("Compared with your previous report, your results show mixed changes. Please review with your healthcare provider.");
    }

    return parts.join(" ");
  }

  async getTrends(documentId: string): Promise<TrendComparison[]> {
    const rows = await db.select().from(docTrendComparisonsTable)
      .where(eq(docTrendComparisonsTable.documentId, documentId))
      .orderBy(desc(docTrendComparisonsTable.createdAt));
    return rows.map((r) => ({
      testName: r.testName,
      currentValue: r.currentValue || "",
      previousValue: r.previousValue || "",
      currentClassification: this.normalizeClassification(r.currentClassification || "normal"),
      previousClassification: this.normalizeClassification(r.previousClassification || "normal"),
      trend: r.trend as TrendDirection || "stable",
      unit: r.unit || undefined,
      absoluteChange: r.absoluteChange || undefined,
      percentChange: r.percentChange || undefined,
      isSignificant: r.isSignificant ?? false,
    }));
  }
}
