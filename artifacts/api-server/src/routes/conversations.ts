import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  safetyEvaluationsTable,
  chatAttachmentsTable,
  type ChatAttachment,
  type MessageAttachment,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { IMAGE_ANALYSIS_SYSTEM_PROMPT } from "../lib/imageGuidance";
import { analyzeSymptoms } from "../lib/symptomEngine";
import { generateAssessment } from "../lib/assessmentEngine";
import { generateFollowUpQuestions } from "../lib/followUpEngine";
import { validateAssessment } from "../lib/validationEngine";
import { assessConfidence } from "../lib/confidenceEngine";
import { evaluateEscalation } from "../lib/escalationEngine";
import { generateClinicalSummary } from "../lib/summaryEngine";
import { generateSelfCarePlan } from "../lib/selfCareEngine";
import { generateOTCGuidance } from "../lib/otcEngine";
import { generateRemedyPlan } from "../lib/remedyEngine";
import { generateRecoveryPlan } from "../lib/recoveryEngine";
import { generatePreventionPlan } from "../lib/preventionEngine";
import { calculateHealthRiskScore } from "../lib/riskEngine";
import { generateCareRecommendation } from "../lib/triageEngine";
import { recommendLabTests } from "../lib/labEngine";
import { generateReport, generateReportSummary } from "../lib/reportEngine";
import { healthReportsTable } from "@workspace/db";
import {
  extractMedicalMemory,
  saveMedicalMemory,
  getRelevantMemories,
  formatMemoriesForPrompt,
} from "../lib/memoryEngine";
import { getRagEngine } from "../lib/rag/ragEngine";
import {
  createInitialState,
  buildSystemPrompt,
  getEffectiveDDx,
  type ConsultationState,
} from "../lib/orchestrator";
import { SafetyFramework } from "../lib/safety/framework";
import { classifyQueryRisk, buildHighRiskPrefix, buildInsufficientInfoResponse } from "../lib/safety/queryClassifier";
import { llm, getModelConfig } from "../lib/llm";
import { AnalyticsCollector } from "../lib/observability/analyticsCollector";
import { ProviderComparator } from "../lib/observability/providerComparator";

const MAX_ATTACHMENTS_PER_MESSAGE = 6;
const chatImageDir = path.join(process.cwd(), "uploads", "chat-images");

function generateTitle(content: string): string {
  const words = content.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length < content.trim().length ? `${words}…` : words;
}

type VisionPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function loadImageParts(attachments: ChatAttachment[]): VisionPart[] {
  const parts: VisionPart[] = [];
  for (const att of attachments) {
    try {
      const filePath = path.join(chatImageDir, att.storageKey);
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      if (buf.length === 0) continue;
      parts.push({
        type: "image_url",
        image_url: { url: `data:${att.mimeType};base64,${buf.toString("base64")}` },
      });
    } catch (err) {
      console.error("[conversations] failed to load image for prompt:", err);
    }
  }
  return parts;
}

function toMessageAttachment(att: ChatAttachment): MessageAttachment {
  return {
    id: att.id,
    type: "image",
    url: `/api/images/${att.id}`,
    mimeType: att.mimeType,
    name: att.name,
    size: att.size ?? undefined,
    width: att.width ?? undefined,
    height: att.height ?? undefined,
  };
}

const router: IRouter = Router();

router.get("/conversations", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId));

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
  const body = (req.body ?? {}) as {
    content?: string;
    attachments?: { id: string }[] | string[];
  };
  const content = (body.content ?? "").trim();
  const attachmentIds = (
    Array.isArray(body.attachments)
      ? body.attachments
          .map((a) => (typeof a === "string" ? a : a?.id))
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      : []
  ).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);

  if (!content && attachmentIds.length === 0) {
    res.status(400).json({ error: "message content or an attachment is required" });
    return;
  }
  if (!llm.primary) {
    res.status(503).json({ error: "No LLM providers configured (set GROQ_API_KEY or OPENAI_API_KEY)" });
    return;
  }

  // Validate attachment ownership BEFORE any AI work runs.
  let userAttachments: ChatAttachment[] = [];
  if (attachmentIds.length > 0) {
    userAttachments = await db
      .select()
      .from(chatAttachmentsTable)
      .where(
        and(
          inArray(chatAttachmentsTable.id, attachmentIds),
          eq(chatAttachmentsTable.userId, userId),
        ),
      );
    if (userAttachments.length !== attachmentIds.length) {
      res.status(400).json({ error: "One or more attachments are invalid or unauthorized" });
      return;
    }
  }
  const hasImages = userAttachments.length > 0;

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
      .values({
        conversationId: id,
        role: "user",
        content: content || (hasImages ? "Sent an image" : ""),
        attachments: hasImages ? userAttachments.map(toMessageAttachment) : [],
      })
      .returning();

    // Link attachments to this message + conversation (ownership already verified).
    if (hasImages) {
      await db
        .update(chatAttachmentsTable)
        .set({ messageId: userMessage.id, conversationId: id })
        .where(inArray(chatAttachmentsTable.id, attachmentIds));
    }

    // Initialize orchestration state
    const state: ConsultationState = createInitialState(
      content || (hasImages ? "[Image message]" : ""),
      history.map((m) => ({ role: m.role, content: m.content })),
    );

    // ── Pipeline: Step 0 — Lightweight Risk Classification ──
    // Runs BEFORE any LLM calls (<5ms). Categorizes query risk to enable
    // early short-circuiting for emergencies and appropriate routing.
    // See lib/safety/queryClassifier.ts for design rationale.
    const riskClassification = content ? classifyQueryRisk(content) : null;
    if (riskClassification) {
      console.log(
        `[conversations] risk classification: ${riskClassification.riskLevel} ` +
        `(${riskClassification.matchedPatterns.join(", ") || "no patterns"})`
      );
    }

    // Emergency short-circuit: if the classifier detects an emergency,
    // skip all LLM calls and return a safety message immediately.
    // This costs <5ms and ensures the user gets safety guidance instantly.
    if (riskClassification?.shouldShortCircuit) {
      const emergencyResponse = riskClassification.shortCircuitMessage ?? "Please seek immediate medical attention.";

      // Still persist the user message and the AI response for record-keeping
      const [aiMessage] = await db
        .insert(messagesTable)
        .values({
          conversationId: id,
          role: "assistant",
          content: emergencyResponse,
        })
        .returning();

      // Send the emergency response via SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ content: emergencyResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, userMessage, aiMessage })}\n\n`);
      res.end();

      console.log(`[conversations] emergency short-circuit (${riskClassification.reason})`);
      return;
    }

    // Insufficient info: provide a clarifying response instead of guessing.
    // This avoids wasting LLM compute on a query we can't safely answer.
    if (riskClassification?.riskLevel === "insufficient" && content) {
      const insufficientResponse = buildInsufficientInfoResponse(content);

      const [aiMessage] = await db
        .insert(messagesTable)
        .values({
          conversationId: id,
          role: "assistant",
          content: insufficientResponse,
        })
        .returning();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ content: insufficientResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, userMessage, aiMessage })}\n\n`);
      res.end();

      console.log(`[conversations] insufficient info short-circuit`);
      return;
    }

    // ── Pipeline: Step 1 — Symptom Analysis ──
    if (content) {
      try {
        state.symptomAnalysis = await analyzeSymptoms(
          history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          content,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[conversations] symptom analysis failed:", msg);
      }
    } else {
      state.symptomAnalysis = null;
    }

    // ── Pipeline: Step 2 — Escalation Engine ──
    if (state.symptomAnalysis && state.symptomAnalysis.allSymptoms.length > 0) {
      try {
        state.escalation = await evaluateEscalation(
          state.symptomAnalysis,
          history.map((m) => ({ role: m.role, content: m.content })),
          content,
        );
        if (state.escalation) {
          console.log(`[conversations] escalation: ${state.escalation.escalationLevel} (${state.escalation.redFlags.length} red flags)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[conversations] escalation evaluation failed:", msg);
      }
    }

    // Determine effective emergency state
    const isEmergency = state.escalation?.isEmergency ?? state.symptomAnalysis?.isEmergency ?? false;
    const hasRedFlags = (state.escalation?.redFlags.length ?? state.symptomAnalysis?.emergencyFlags.length ?? 0) > 0;

    // ── Pipeline: Step 2b — RAG medical evidence retrieval (BEFORE stream) ──
    // RAG evidence must be available when building the system prompt so the LLM
    // can synthesize retrieved medical literature into its response.
    let ragCitations: import("../lib/rag/types").CitationEvidence[] = [];
    if (!isEmergency && content) {
      try {
        const ragEngine = getRagEngine();

        // Primary: symptom + clinical context (most relevant for retrieval)
        const primaryParts: string[] = [];
        if (state.symptomAnalysis?.primarySymptom?.normalized) {
          primaryParts.push(state.symptomAnalysis.primarySymptom.normalized);
        }
        if (state.symptomAnalysis?.clinicalProfile) {
          const cp = state.symptomAnalysis.clinicalProfile;
          const profileParts = [
            cp.age ? `age ${cp.age}` : "",
            cp.gender ?? "",
            ...(cp.medicalHistory ?? []),
            ...(cp.currentMedications ?? []),
          ].filter(Boolean);
          if (profileParts.length > 0) {
            primaryParts.push(profileParts.join(" "));
          }
        }

        const queryText = primaryParts.filter(Boolean).join(" ").trim();

        if (queryText.length > 10) {
          const { evidenceBlock, citations } = await ragEngine.formatEvidenceForPrompt({
            text: queryText,
            userId,
            pipelineStage: "diagnosis",
            useCache: true,
          });
          state.ragEvidence = evidenceBlock;
          ragCitations = citations;
          console.log(`[conversations] RAG evidence retrieved: ${citations.length} citations (query: ${queryText.slice(0, 60)}...)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[conversations] RAG evidence retrieval failed:", msg);
      }
    }

    // Build unified system prompt from state (symptom analysis + escalation + history).
    // NOTE: We stream the response FIRST and run the remaining enrichment engines
    // (assessment, validation, confidence, self-care, OTC, remedies, recovery,
    // prevention, risk, triage, lab tests, memory, RAG) in the background AFTER the
    // stream completes. This keeps time-to-first-token fast instead of waiting for a
    // long chain of LLM calls that can be throttled by provider rate limits.
    //
    // For high-risk medical queries, prepend a safety prefix that forces
    // the LLM to use uncertainty language and recommend professional consultation.
    const highRiskPrefix = riskClassification?.riskLevel === "high_risk"
      ? buildHighRiskPrefix()
      : "";
    const systemContent =
      highRiskPrefix +
      buildSystemPrompt(state) +
      (hasImages ? `\n\n${IMAGE_ANALYSIS_SYSTEM_PROMPT}` : "");

    // Stream SSE response via LLM provider abstraction
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let fullResponse = "";
    let streamUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let streamErrorMsg: string | null = null;

    const historyForModel = history.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));

    let userContent: string | VisionPart[];
    if (hasImages) {
      const parts: VisionPart[] = [];
      if (content) parts.push({ type: "text", text: content });
      parts.push(...loadImageParts(userAttachments));
      userContent = parts.length > 0 ? parts : [{ type: "text", text: "[Image message]" }];
    } else {
      userContent = content;
    }

    const streamController = new AbortController();
    const streamTimeout = setTimeout(() => streamController.abort(), 60_000);

    const config = getModelConfig();

    await llm.streamChat({
      systemPrompt: systemContent,
      messages: [
        ...historyForModel,
        { role: "user", content: userContent as any },
      ],
      model: hasImages ? config.visionModel : config.chatModel,
      signal: streamController.signal,
      callbacks: {
        onChunk: (chunk: { content: string }) => {
          fullResponse += chunk.content;
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        },
        onDone: (_fullText: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => {
          streamUsage = usage;
        },
        onError: (err: unknown) => {
          streamErrorMsg = err instanceof Error ? err.message : String(err);
        },
      },
    });

    clearTimeout(streamTimeout);

    if (streamErrorMsg) {
      console.error("[conversations] streaming call failed:", streamErrorMsg);
      // Roll back the persisted user message so a retry does not duplicate it.
      try {
        await db.delete(messagesTable).where(eq(messagesTable.id, userMessage.id));
        if (hasImages) {
          await db
            .update(chatAttachmentsTable)
            .set({ messageId: null, conversationId: null })
            .where(inArray(chatAttachmentsTable.id, attachmentIds));
        }
      } catch {
        // best-effort rollback
      }
      res.write(`data: ${JSON.stringify({ error: streamErrorMsg })}\n\n`);
      res.end();
      return;
    }

    state.finalResponse = fullResponse;

    // ── Safety & Guardrails Evaluation ──
    try {
      const safetyFramework = new SafetyFramework();
      const safetyResult = await safetyFramework.evaluate(fullResponse, {
        userId,
        conversationId: id,
        queryText: content,
      });

      if (safetyResult.action === "block" && safetyResult.fallbackMessage) {
        fullResponse = safetyResult.fallbackMessage;
        state.finalResponse = fullResponse;
      }

      // Persist safety evaluation
      await db.insert(safetyEvaluationsTable).values({
        userId,
        conversationId: id,
        responseText: fullResponse,
        queryText: content,
        overallStatus: safetyResult.overallStatus,
        action: safetyResult.action,
        fallbackMessage: safetyResult.fallbackMessage,
        originalResponse: safetyResult.originalResponse,
        passedCount: safetyResult.results.filter((r) => r.status === "passed").length,
        warningCount: safetyResult.results.filter((r) => r.status === "warning").length,
        failedCount: safetyResult.results.filter((r) => r.status === "failed").length,
        qualityScore: safetyResult.scores.qualityScore,
        hallucinationScore: safetyResult.scores.hallucinationScore,
        confidenceScore: safetyResult.scores.confidenceScore,
        clinicalRiskScore: safetyResult.scores.clinicalRiskScore,
        latencyMs: safetyResult.latencyMs,
      }).execute();
    } catch (safetyErr) {
      console.error("[safety] evaluation failed:", safetyErr);
    }

    // ── Build citation footer from RAG evidence ──
    if (ragCitations.length > 0) {
      const uniqueDocs = new Map<string, typeof ragCitations[0]>();
      for (const c of ragCitations) {
        if (!uniqueDocs.has(c.documentId)) uniqueDocs.set(c.documentId, c);
      }
      const footerLines: string[] = ["", "---", "**Sources used:**"];
      let idx = 1;
      for (const [, c] of uniqueDocs) {
        const parts: string[] = [];
        if (c.guidelineName) parts.push(c.guidelineName);
        if (c.journal) parts.push(`*${c.journal}*`);
        if (c.publicationDate) parts.push(`(${new Date(c.publicationDate).getFullYear()})`);
        if (c.pmcid) parts.push(`PMCID: ${c.pmcid}`);
        if (c.sourceUrl) parts.push(c.sourceUrl);
        footerLines.push(`${idx}. ${parts.join(" — ")}`);
        idx++;
      }
      footerLines.push("");
      footerLines.push("*This response was grounded in retrieved medical literature. It is informational and is not a diagnosis or personalized medical advice.*");
      const citationFooter = footerLines.join("\n");
      fullResponse += citationFooter;
      state.finalResponse = fullResponse;
      // Send citation footer as a final content chunk
      res.write(`data: ${JSON.stringify({ content: citationFooter })}\n\n`);
    }

    // ── Persist AI message ──
    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: id, role: "assistant", content: fullResponse })
      .returning();

    // ── Update conversation metadata ──
    const lastMsgText = content || "Sent an image";
    const isFirstMessage = conv.lastMessage === null;
    await db
      .update(conversationsTable)
      .set({
        lastMessage: lastMsgText.slice(0, 100),
        updatedAt: new Date(),
        ...(isFirstMessage ? { title: generateTitle(lastMsgText) } : {}),
      })
      .where(eq(conversationsTable.id, id));

    // Send completion event immediately so the client renders the response fast.
    res.write(
      `data: ${JSON.stringify({ done: true, userMessage, aiMessage })}\n\n`,
    );
    res.end();

    // ── Background enrichment pipeline (fire-and-forget) ──
    // The enrichment engines below each make a separate LLM call. Running them
    // sequentially BEFORE streaming caused time-to-first-token to balloon (provider
    // rate limits throttle the chain of calls). They are now executed after the
    // response is delivered; they update memory, reports, summaries and lab tests.
    void (async () => {
      try {
        // ── Pipeline: Step 3 — Route (follow-up or DDx) ──
        if (state.symptomAnalysis && !isEmergency && !hasRedFlags) {
          if (state.symptomAnalysis.assessmentReady) {
            // Step 4 — Differential Diagnosis
            try {
              state.differentialDiagnosis = await generateAssessment(
                state.symptomAnalysis,
                history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
                content.trim(),
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[conversations] assessment generation failed:", msg);
            }

            // Step 5 — Medical Knowledge Validation
            if (state.differentialDiagnosis) {
              try {
                state.validation = await validateAssessment(state.differentialDiagnosis, state.symptomAnalysis);
                if (state.validation && state.validation.issues.length > 0) {
                  console.log("[conversations] validation issues:", state.validation.issues.length);
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("[conversations] validation failed:", msg);
              }
            }

            // Step 6 — Confidence & Uncertainty Evaluation
            const ddxForConfidence = getEffectiveDDx(state);
            if (ddxForConfidence) {
              try {
                state.confidence = await assessConfidence(
                  state.symptomAnalysis,
                  ddxForConfidence,
                  state.validation,
                  history.map((m) => ({ role: m.role, content: m.content })),
                );
                if (state.confidence) {
                  console.log(`[conversations] confidence score: ${state.confidence.confidenceScore} (${state.confidence.overallConfidence})`);
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("[conversations] confidence assessment failed:", msg);
              }
            }
          } else if (state.symptomAnalysis.allSymptoms.length > 0) {
            // Step 3b — Follow-up Question Engine
            try {
              state.followUp = await generateFollowUpQuestions(
                state.symptomAnalysis,
                history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
                content.trim(),
              );
              if (state.followUp && state.followUp.questions.length > 0) {
                console.log(`[conversations] follow-up: ${state.followUp.questions.length} questions`);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[conversations] follow-up generation failed:", msg);
            }
          }
        }

        // ── Pipeline: Step 7 — Self-Care Guidance Engine ──
        if (state.symptomAnalysis && state.differentialDiagnosis && !isEmergency && !hasRedFlags) {
          try {
            const ddx = getEffectiveDDx(state);
            state.selfCare = await generateSelfCarePlan(
              state.symptomAnalysis,
              ddx,
              state.confidence?.confidenceScore ?? null,
            );
            if (state.selfCare) {
              console.log(`[conversations] self-care: ${state.selfCare.recommendations.length} recommendations`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] self-care generation failed:", msg);
          }

          // Step 8 — OTC Medication Guidance Engine
          try {
            const ddx = getEffectiveDDx(state);
            state.otcGuidance = await generateOTCGuidance(
              state.symptomAnalysis,
              ddx,
              state.confidence?.confidenceScore ?? null,
            );
            if (state.otcGuidance) {
              console.log(`[conversations] OTC guidance: ${state.otcGuidance.recommendations.length} medications`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] OTC guidance generation failed:", msg);
          }

          // Step 9 — Home Remedies & Traditional Wellness Engine
          try {
            const emergencyLevel = state.escalation?.escalationLevel === "emergency";
            state.remedyPlan = await generateRemedyPlan(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              emergencyLevel,
            );
            if (state.remedyPlan && state.remedyPlan.homeRemedies.length > 0) {
              console.log(`[conversations] Remedy plan: ${state.remedyPlan.homeRemedies.length} remedies, ${state.remedyPlan.traditionalWellness.length} traditional`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] Remedy plan generation failed:", msg);
          }

          // Step 10 — Recovery Timeline & Monitoring Engine
          try {
            state.recoveryPlan = await generateRecoveryPlan(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              state.confidence,
              state.escalation,
            );
            if (state.recoveryPlan && state.recoveryPlan.recoveryTimelines.length > 0) {
              console.log(`[conversations] Recovery plan: ${state.recoveryPlan.recoveryTimelines.length} timelines, status: ${state.recoveryPlan.recoveryStatus}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] Recovery plan generation failed:", msg);
          }

          // Step 11 — Prevention & Lifestyle Engine
          try {
            const emergencyLevel = state.escalation?.escalationLevel === "emergency";
            state.preventionPlan = await generatePreventionPlan(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              state.symptomAnalysis.clinicalProfile ?? null,
              emergencyLevel,
            );
            if (state.preventionPlan && state.preventionPlan.wellnessTips.length > 0) {
              console.log(`[conversations] Prevention: ${state.preventionPlan.wellnessTips.length} tips, ${state.preventionPlan.healthEducation.length} education items`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] Prevention plan generation failed:", msg);
          }
        }

        // ── Pipeline: Step 12 — Health Risk Scoring Engine ──
        if (state.symptomAnalysis) {
          try {
            state.healthRiskScore = await calculateHealthRiskScore(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              state.confidence,
              state.escalation,
            );
            if (state.healthRiskScore) {
              console.log(`[conversations] Health risk score: ${state.healthRiskScore.overallScore} (${state.healthRiskScore.riskCategory})`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] Health risk score generation failed:", msg);
          }
        }

        // ── Pipeline: Step 13 — Care Recommendation & Triage Engine ──
        if (state.symptomAnalysis) {
          try {
            state.careRecommendation = await generateCareRecommendation(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              state.confidence,
              state.escalation,
              state.healthRiskScore,
            );
            if (state.careRecommendation) {
              console.log(`[conversations] Care recommendation: ${state.careRecommendation.careRecommendation} (escalation: ${state.careRecommendation.escalationRequired})`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] Care recommendation generation failed:", msg);
          }
        }

        // ── Pipeline: Step 14 — Laboratory Test Recommendation Engine ──
        if (state.symptomAnalysis && !isEmergency && state.differentialDiagnosis) {
          try {
            state.laboratoryTests = await recommendLabTests(
              state.symptomAnalysis,
              getEffectiveDDx(state),
              state.confidence,
              state.escalation,
              state.healthRiskScore,
            );
            if (state.laboratoryTests) {
              const n = state.laboratoryTests.recommendedTests.length;
              console.log(`[conversations] lab tests: ${n > 0 ? `${n} recommended` : "no tests needed"}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] lab test recommendation failed:", msg);
          }
        }

        // ── Pipeline: Step 15a — Retrieve & inject relevant medical memories ──
        try {
          const currentSymptoms = state.symptomAnalysis?.allSymptoms.map(s => s.normalized) ?? [];
          const currentDiagnoses = getEffectiveDDx(state)?.conditions.map(c => c.name) ?? [];
          const relevant = await getRelevantMemories(userId, currentSymptoms, currentDiagnoses);
          if (relevant.length > 0) {
            state.relevantMemories = formatMemoriesForPrompt(relevant);
            state.userId = userId;
            console.log(`[conversations] injected ${relevant.length} relevant memories`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[conversations] memory retrieval failed:", msg);
        }

        // ── Pipeline: Step 15b — Persist RAG citations for observability ──
        if (ragCitations.length > 0) {
          try {
            const citationEngine = new (await import("../lib/rag/retrieval/citationEngine")).CitationEngine();
            await citationEngine.persistCitations(ragCitations, {
              userId,
              conversationId: id,
              pipelineStage: "diagnosis",
            });
            console.log(`[conversations] persisted ${ragCitations.length} RAG citations`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] citation persistence failed:", msg);
          }
        }

        // ── Post-stream: Save Lab Test Recommendations ──
        if (state.laboratoryTests) {
          try {
            await db
              .update(conversationsTable)
              .set({ laboratoryTests: state.laboratoryTests } as any)
              .where(eq(conversationsTable.id, id));
            console.log("[conversations] lab tests saved");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] lab tests save failed:", msg);
          }
        }

        // ── Personalized Clinical Summary ──
        if (state.symptomAnalysis && aiMessage) {
          try {
            const ddx = getEffectiveDDx(state);
            state.clinicalSummary = await generateClinicalSummary(
              state.symptomAnalysis,
              ddx,
              state.validation,
              state.confidence,
              history.map((m) => ({ role: m.role, content: m.content })),
              content.trim(),
            );
            if (state.clinicalSummary) {
              await db
                .update(conversationsTable)
                .set({ clinicalSummary: state.clinicalSummary } as any)
                .where(eq(conversationsTable.id, id));
              console.log("[conversations] clinical summary saved");
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] summary generation failed:", msg);
          }
        }

        // ── Save medical memory ──
        if (state.symptomAnalysis) {
          try {
            const memory = extractMedicalMemory(state, userId, id);
            await saveMedicalMemory(userId, id, memory);
            console.log("[conversations] medical memory saved");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] memory save failed:", msg);
          }
        }

        // ── Auto-generate Medical Report ──
        if (state.symptomAnalysis) {
          try {
            const report = generateReport(state, conv.createdAt.toISOString());
            report.reportId = id;
            const reportSummary = generateReportSummary(report);
            await db
              .insert(healthReportsTable)
              .values({
                userId,
                conversationId: id,
                title: `Consultation Report - ${new Date().toLocaleDateString()}`,
                summary: reportSummary,
                score: report.riskAssessment.overallScore || null,
                highlights: report.differentialDiagnoses.slice(0, 3).map(d => `${d.condition} (${d.confidence}%)`),
                reportData: report as any,
              })
              .onConflictDoNothing();
            console.log("[conversations] medical report auto-generated");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[conversations] report generation failed:", msg);
          }
        }

        // ── Observability: Record consultation analytics ──
        try {
          const obsAnalytics = new AnalyticsCollector();
          await obsAnalytics.recordTelemetry({
            conversationId: id,
            userId,
            durationMs: Date.now() - conv.createdAt.getTime(),
            followUpCount: state.symptomAnalysis?.followUpQuestions?.length ?? 0,
            tokensInput: streamUsage.promptTokens,
            tokensOutput: streamUsage.completionTokens,
            llmProvider: llm.primary?.name ?? "groq",
            llmModel: hasImages ? config.visionModel : config.chatModel,
            responseLatencyMs: 0,
            safetyInterventions: 0,
            confidenceScore: state.confidence?.confidenceScore ?? undefined,
            finalRiskCategory: state.healthRiskScore?.riskCategory ?? undefined,
            recommendationCategory: state.careRecommendation?.careRecommendation ?? undefined,
            hadEscalation: state.escalation?.isEmergency ?? false,
            hadFallback: false,
          });

          const providerComparator = new ProviderComparator();
          await providerComparator.recordCall({
            provider: llm.primary?.name ?? "groq",
            model: hasImages ? config.visionModel : config.chatModel,
            taskType: "generation",
            latencyMs: 0,
            tokensInput: streamUsage.promptTokens,
            tokensOutput: streamUsage.completionTokens,
            success: true,
          });
        } catch (obsErr) {
          console.error("[observability] recording failed:", obsErr);
        }
      } catch (err) {
        (req as any).log.error({ err }, "background enrichment failed");
      }
    })();
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
