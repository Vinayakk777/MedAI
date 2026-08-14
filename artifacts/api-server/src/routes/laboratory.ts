import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { LabRecommendationResult } from "../lib/labEngine";

const router: IRouter = Router();

router.get("/laboratory-tests", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const conversationId = req.query.conversationId as string | undefined;

  try {
    const rows = await db
      .select({
        id: conversationsTable.id,
        title: conversationsTable.title,
        laboratoryTests: conversationsTable.laboratoryTests,
        updatedAt: conversationsTable.updatedAt,
      })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.userId, userId),
          isNotNull(conversationsTable.laboratoryTests),
          conversationId ? eq(conversationsTable.id, conversationId) : undefined,
        ),
      )
      .orderBy(conversationsTable.updatedAt)
      .limit(conversationId ? 1 : 50);

    const data = rows.map((r) => ({
      conversationId: r.id,
      conversationTitle: r.title,
      tests: r.laboratoryTests as LabRecommendationResult | null,
      updatedAt: r.updatedAt,
    }));

    res.json(conversationId ? data[0] ?? null : data);
  } catch (err) {
    (req as any).log.error({ err }, "fetch lab tests failed");
    res.status(500).json({ error: "Failed to fetch lab test recommendations" });
  }
});

export default router;
