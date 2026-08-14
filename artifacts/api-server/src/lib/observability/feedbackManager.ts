import { db, userFeedbackTable, feedbackPatternsTable } from "@workspace/db";
import { eq, and, gte, desc, count, sql } from "drizzle-orm";
import type { UserFeedbackInput, DetectedPattern } from "./types";

const PATTERN_RULES = [
  { pattern: "too_much_jargon", label: "Too much medical jargon", keywords: ["jargon", "too technical", "hard to understand", "complicated words", "confusing terms"] },
  { pattern: "repetitive_advice", label: "Advice was repetitive", keywords: ["repetitive", "repeating", "same thing", "said that already", "keeps saying"] },
  { pattern: "unnecessary_questions", label: "Asked unnecessary questions", keywords: ["unnecessary", "irrelevant", "not related", "why are you asking", "too many questions"] },
  { pattern: "missed_symptom", label: "Missed an important symptom", keywords: ["missed", "ignored", "didn't mention", "overlooked", "forgot about"] },
  { pattern: "too_general", label: "Advice was too general", keywords: ["too general", "vague", "not specific", "generic", "doesn't apply"] },
  { pattern: "too_cautious", label: "Too cautious / defensive", keywords: ["too cautious", "defensive", "always says see a doctor", "not helpful", "just tells me to consult"] },
  { pattern: "inaccurate", label: "Inaccurate information", keywords: ["wrong", "incorrect", "inaccurate", "not true", "misleading", "false"] },
  { pattern: "not_empathetic", label: "Lacked empathy", keywords: ["not empathetic", "cold", "robot", "doesn't care", "impersonal", "too formal"] },
];

export class FeedbackManager {
  async submitFeedback(userId: string, input: UserFeedbackInput): Promise<string> {
    // Auto-detect patterns from free text
    const categories = this.detectPatterns(input.freeText || "");

    const [saved] = await db.insert(userFeedbackTable).values({
      userId,
      conversationId: input.conversationId,
      rating: input.rating,
      accuracyRating: input.accuracyRating,
      easeOfUnderstanding: input.easeOfUnderstanding,
      helpfulness: input.helpfulness,
      trustLevel: input.trustLevel,
      freeText: input.freeText,
      categories: categories.length > 0 ? categories : undefined,
    }).returning();

    // Update pattern frequencies
    for (const cat of categories) {
      await this.incrementPatternFrequency(cat);
    }

    return saved.id;
  }

  async getFeedback(userId: string, limit = 50, offset = 0) {
    return db.select()
      .from(userFeedbackTable)
      .where(eq(userFeedbackTable.userId, userId))
      .orderBy(desc(userFeedbackTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getFeedbackSummary() {
    const [total] = await db.select({ count: count() }).from(userFeedbackTable);

    const [helpful] = await db.select({ count: count() })
      .from(userFeedbackTable)
      .where(eq(userFeedbackTable.rating, "helpful"));

    const [notHelpful] = await db.select({ count: count() })
      .from(userFeedbackTable)
      .where(eq(userFeedbackTable.rating, "not_helpful"));

    const avgScore = await db.select({
      accuracy: sql<number>`avg(accuracy_rating)`,
      ease: sql<number>`avg(ease_of_understanding)`,
      helpfulness: sql<number>`avg(helpfulness)`,
      trust: sql<number>`avg(trust_level)`,
    })
      .from(userFeedbackTable);

    // Pattern frequency
    const patterns = await db.select()
      .from(feedbackPatternsTable)
      .orderBy(desc(feedbackPatternsTable.frequency))
      .limit(20);

    // Last 7 days trend
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentHelpful = await db.select({ count: count() })
      .from(userFeedbackTable)
      .where(and(
        eq(userFeedbackTable.rating, "helpful"),
        gte(userFeedbackTable.createdAt, last7d),
      ));

    return {
      total: Number(total.count),
      helpful: Number(helpful.count),
      notHelpful: Number(notHelpful.count),
      satisfactionRate: Number(total.count) > 0
        ? ((Number(helpful.count) / Number(total.count)) * 100).toFixed(1)
        : "0",
      averageScores: {
        accuracy: Math.round(Number(avgScore[0]?.accuracy || 0) * 10) / 10,
        easeOfUnderstanding: Math.round(Number(avgScore[0]?.ease || 0) * 10) / 10,
        helpfulness: Math.round(Number(avgScore[0]?.helpfulness || 0) * 10) / 10,
        trustLevel: Math.round(Number(avgScore[0]?.trust || 0) * 10) / 10,
      },
      patterns: patterns.map((p) => ({
        pattern: p.pattern,
        label: p.label,
        frequency: p.frequency,
        lastSeen: p.lastSeen,
      })),
      recentSatisfactionRate: Number(recentHelpful[0]?.count || 0),
    };
  }

  async resolveFeedback(feedbackId: string): Promise<void> {
    await db.update(userFeedbackTable)
      .set({ isResolved: true })
      .where(eq(userFeedbackTable.id, feedbackId));
  }

  private detectPatterns(freeText: string): string[] {
    if (!freeText) return [];
    const lower = freeText.toLowerCase();
    return PATTERN_RULES
      .filter((rule) => rule.keywords.some((kw) => lower.includes(kw)))
      .map((rule) => rule.pattern);
  }

  private async incrementPatternFrequency(pattern: string): Promise<void> {
    const [existing] = await db.select()
      .from(feedbackPatternsTable)
      .where(eq(feedbackPatternsTable.pattern, pattern))
      .limit(1);

    if (existing) {
      await db.update(feedbackPatternsTable)
        .set({
          frequency: sql`frequency + 1`,
          lastSeen: new Date(),
        })
        .where(eq(feedbackPatternsTable.id, existing.id));
    } else {
      const rule = PATTERN_RULES.find((r) => r.pattern === pattern);
      await db.insert(feedbackPatternsTable).values({
        pattern,
        label: rule?.label || pattern,
        frequency: 1,
      });
    }
  }
}
