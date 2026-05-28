import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const AI_RESPONSES = [
  `Based on your description, this is consistent with a **tension-type headache** — the most common headache type, often triggered by stress, dehydration, or prolonged screen time.

**Immediate recommendations:**
- Drink 2–3 glasses of water over the next hour
- Take **acetaminophen 500–1000mg** or **ibuprofen 400mg** with food
- Rest in a quiet, dimly lit environment for 20–30 minutes

**Monitor for red flags:**
- Sudden, severe "thunderclap" onset
- Fever above 38.5°C (101.3°F) with neck stiffness
- Visual disturbances or confusion
- Headache that wakes you from sleep

> If symptoms persist beyond 72 hours or worsen significantly, please consult your physician.`,

  `I can help you check that interaction. Based on the medications you've mentioned:

**Potential interaction identified:**

**Ibuprofen + Lisinopril** — *Moderate concern*
- NSAIDs like ibuprofen can reduce the antihypertensive effect of ACE inhibitors
- May increase risk of acute kidney injury with long-term combined use

**Safer alternative:**
Consider **acetaminophen (Tylenol)** for pain relief — it does not share this interaction profile.

**What I recommend:**
1. Switch to acetaminophen for occasional pain management
2. Mention this to your prescribing physician at your next visit
3. Avoid regular NSAID use while on lisinopril

> This information is educational. Do not change your medications without consulting your doctor.`,

  `Thank you for sharing that. Let me walk you through what this could mean.

**Most likely possibilities** (based on your description):

1. **Contact dermatitis** — reaction to soap, detergent, or fabric
2. **Eczema (atopic dermatitis)** — especially if you have a history of allergies
3. **Tinea (ringworm)** — fungal infection, common and easily treated

**Key questions to help narrow this down:**
- Is it spreading or staying localized?
- Is it itchy, painful, or neither?
- Have you changed any products recently (soap, laundry detergent, lotion)?

**For now:**
- Avoid scratching — it can introduce bacteria
- Apply a fragrance-free moisturizer
- Consider 1% hydrocortisone cream for itch relief (available OTC)

> If the rash spreads, develops blisters, or is accompanied by fever, seek in-person evaluation promptly.`,

  `That's a great question about vitamin supplementation. Here's what the evidence says:

**Vitamin D Deficiency — Signs & Symptoms:**
- Fatigue and low energy
- Bone or muscle aches
- Frequent infections (vitamin D supports immune function)
- Low mood or seasonal depression

**Testing:**
A simple blood test (25-hydroxyvitamin D) confirms deficiency. Optimal range is typically **40–60 ng/mL**.

**General supplementation guidance:**
- Mild deficiency: **1,000–2,000 IU daily**
- Moderate deficiency: **2,000–4,000 IU daily** (physician-guided)
- Take with a meal containing fat for best absorption
- Vitamin D3 (cholecalciferol) is preferred over D2

> Ask your doctor to run a baseline 25(OH)D level before starting supplementation.`,

  `I understand you're concerned about when to seek care. Here's a framework clinicians use:

**Call 911 or go to the ER immediately for:**
- Chest pain or pressure
- Sudden severe headache
- Facial drooping, arm weakness, or speech difficulty
- Difficulty breathing at rest

**Go to urgent care today if you notice:**
- High fever (>39°C / 102°F) not responding to medication
- Signs of infection (redness, warmth, swelling, discharge)
- Uncontrolled vomiting or inability to keep fluids down

**Monitor at home if:**
- Symptoms are mild and steadily improving
- No red flag symptoms are present
- You are able to stay hydrated and rest

> When in doubt, trust your instincts — it's always better to be seen and reassured than to wait on something serious.`,
];

let aiIndex = 0;
function nextAIResponse(): string {
  return AI_RESPONSES[aiIndex++ % AI_RESPONSES.length];
}

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

    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: id, role: "user", content: content.trim() })
      .returning();

    const aiContent = nextAIResponse();
    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: id, role: "assistant", content: aiContent })
      .returning();

    const isFirstMessage = conv.lastMessage === null;
    await db
      .update(conversationsTable)
      .set({
        lastMessage: content.trim().slice(0, 100),
        updatedAt: new Date(),
        ...(isFirstMessage ? { title: generateTitle(content.trim()) } : {}),
      })
      .where(eq(conversationsTable.id, id));

    res.json({ userMessage, aiMessage });
  } catch (err) {
    (req as any).log.error({ err }, "send message failed");
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
