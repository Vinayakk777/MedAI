import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { VoiceEngine } from "../lib/voice/voiceEngine";
import { db, voiceSessionsTable, voiceTranscriptsTable, voiceAudioChunksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();
const voiceEngine = new VoiceEngine();

// ─── REST: Session Management ───

router.post("/voice/sessions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { language, mode } = req.body;
    const [saved] = await db.insert(voiceSessionsTable).values({
      userId: req.userId,
      language: language || "en",
      mode: mode || "voice",
      status: "active",
    }).returning();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/voice/sessions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(voiceSessionsTable)
      .where(and(eq(voiceSessionsTable.userId, req.userId), eq(voiceSessionsTable.status, "active")))
      .orderBy(desc(voiceSessionsTable.createdAt))
      .limit(20);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/voice/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const session = await voiceEngine.getSession(id);
    if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/voice/sessions/:id/end", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const session = await voiceEngine.getSession(id);
    if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    await voiceEngine.endSession(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── REST: Transcripts ───

router.get("/voice/sessions/:id/transcripts", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const session = await voiceEngine.getSession(id);
    if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    const transcripts = await voiceEngine.getTranscripts(id);
    res.json(transcripts);
  } catch (err) {
    res.status(500).json({ error: "Failed to get transcripts" });
  }
});

router.put("/voice/transcripts/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { editedText } = req.body;
    if (!editedText) { res.status(400).json({ error: "editedText required" }); return; }

    // Verify ownership via session
    const [transcript] = await db.select()
      .from(voiceTranscriptsTable)
      .innerJoin(voiceSessionsTable, eq(voiceTranscriptsTable.sessionId, voiceSessionsTable.id))
      .where(and(eq(voiceTranscriptsTable.id, id), eq(voiceSessionsTable.userId, req.userId)))
      .limit(1);

    if (!transcript) { res.status(404).json({ error: "Not found" }); return; }

    await db.update(voiceTranscriptsTable)
      .set({ isEdited: true, editedText, text: editedText })
      .where(eq(voiceTranscriptsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update transcript" });
  }
});

// ─── REST: History ───

router.get("/voice/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const rows = await db.select().from(voiceSessionsTable)
      .where(eq(voiceSessionsTable.userId, req.userId))
      .orderBy(desc(voiceSessionsTable.createdAt))
      .limit(limit).offset(offset);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/voice/history/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const session = await voiceEngine.getSession(id);
    if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    const transcripts = await voiceEngine.getTranscripts(id);
    res.json({ session, transcripts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
export { voiceEngine };
