import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are MedAI, a knowledgeable and empathetic AI medical assistant. You provide accurate, evidence-based health guidance to help people understand their symptoms, medications, and health conditions.

Guidelines:
- Give thorough, clinically-informed answers drawing on up-to-date medical knowledge
- Use clear markdown formatting: **bold** key terms, bullet lists for steps/options, blockquotes for important warnings
- For symptom questions: describe likely causes (most to least probable), suggest self-care steps, and list red-flag signs that warrant urgent care
- For medication questions: cover dosing, interactions, side effects, and safer alternatives when relevant
- For general health questions: provide evidence-based guidance with practical action steps
- Always include a brief disclaimer reminding users to consult a healthcare provider for diagnosis or treatment decisions
- For any life-threatening emergency (chest pain, difficulty breathing, stroke signs, severe bleeding, etc.), lead immediately with: "**Call 911 (or your local emergency number) immediately.**"
- Be warm and reassuring in tone — users are often anxious about their health`;

function generateTitle(content: string): string {
  const words = content.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length < content.trim().length ? `${words}…` : words;
}

const router: IRouter = Router();

router.get("/conversations", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list conversations failed");
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.post("/conversations", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { title = "New Conversation" } = req.body as { title?: string };
  try {
    const [row] = await db
      .insert(conversationsTable)
      .values({ userId, title })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create conversation failed");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/conversations/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, userId)));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    (req as any).log.error({ err }, "get conversation failed");
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    const deleted = await db
      .delete(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, userId)))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete conversation failed");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.patch("/conversations/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  const { title } = req.body as { title: string };
  try {
    const [updated] = await db
      .update(conversationsTable)
      .set({ title })
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, userId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    (req as any).log.error({ err }, "rename conversation failed");
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  const { content } = req.body as { content: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, userId)));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Load full conversation history for context
    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);

    // Persist user message
    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: id, role: "user", content: content.trim() })
      .returning();

    // Build messages array for OpenAI
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: content.trim() },
    ];

    // Stream SSE response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1024,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      }
    }

    // Persist AI message
    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: id, role: "assistant", content: fullResponse })
      .returning();

    // Update conversation metadata
    const isFirstMessage = conv.lastMessage === null;
    await db
      .update(conversationsTable)
      .set({
        lastMessage: content.trim().slice(0, 100),
        updatedAt: new Date(),
        ...(isFirstMessage ? { title: generateTitle(content.trim()) } : {}),
      })
      .where(eq(conversationsTable.id, id));

    // Send completion event with persisted message IDs
    res.write(
      `data: ${JSON.stringify({ done: true, userMessage, aiMessage })}\n\n`,
    );
    res.end();
  } catch (err) {
    (req as any).log.error({ err }, "send message failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to send message" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
      res.end();
    }
  }
});

export default router;
