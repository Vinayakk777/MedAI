import { db, voiceSessionsTable, voiceTranscriptsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../logger";
import { createInitialState, buildSystemPrompt } from "../orchestrator";
import { analyzeSymptoms } from "../symptomEngine";
import { evaluateEscalation } from "../escalationEngine";
import { generateAssessment } from "../assessmentEngine";
import { generateFollowUpQuestions } from "../followUpEngine";
import { validateAssessment } from "../validationEngine";
import { assessConfidence } from "../confidenceEngine";
import { SafetyFramework } from "../safety/framework";
import { AnalyticsCollector } from "../observability/analyticsCollector";
import { ProviderComparator } from "../observability/providerComparator";
import OpenAI from "openai";
import { sql } from "drizzle-orm";
import type { VoiceSession, VoiceTranscript, ServerMessage, VoiceEngineState, VoiceSessionStatus } from "./types";

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
  : null;

const CHAT_MODEL = "llama-3.3-70b-versatile";

export class VoiceEngine {
  private sessions: Map<string, {
    state: VoiceEngineState;
    messages: { role: string; content: string }[];
    turnCount: number;
    conversationId?: string;
    send: (msg: ServerMessage) => void;
  }> = new Map();

  async createSession(userId: string, send: (msg: ServerMessage) => void, language = "en", mode = "voice"): Promise<string> {
    const [saved] = await db.insert(voiceSessionsTable).values({ userId, language, mode }).returning();

    this.sessions.set(saved.id, {
      state: "listening",
      messages: [],
      turnCount: 0,
      send,
    });

    logger.info({ sessionId: saved.id, userId }, "Voice session created");
    return saved.id;
  }

  async handleTranscript(sessionId: string, text: string, isFinal: boolean): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    if (!isFinal) {
      session.send({ type: "listening", text });
      return;
    }

    await db.insert(voiceTranscriptsTable).values({
      sessionId,
      source: "user",
      text,
      isFinal: true,
      turnNumber: session.turnCount + 1,
    });

    session.messages.push({ role: "user", content: text });
    session.turnCount++;

    await this.processTurn(sessionId);
  }

  private async processTurn(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "thinking";
    session.send({ type: "state_change", state: "thinking" });

    try {
      const userId = (await db.select({ userId: voiceSessionsTable.userId })
        .from(voiceSessionsTable).where(eq(voiceSessionsTable.id, sessionId)).limit(1))[0]?.userId;

      const latestMessage = session.messages[session.messages.length - 1]?.content || "";
      const engineHistory = session.messages.slice(0, -1)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const state = createInitialState(latestMessage, session.messages);

      state.symptomAnalysis = await analyzeSymptoms(engineHistory, latestMessage);
      state.escalation = await evaluateEscalation(state.symptomAnalysis, session.messages, latestMessage);

      if (state.escalation?.isEmergency) {
        const response = this.buildEmergencyResponse(state.escalation);
        await this.sendResponse(session, response, sessionId, userId);
        return;
      }

      const symptomAnalysis = state.symptomAnalysis;
      const assessmentReady = symptomAnalysis?.assessmentReady === true;
      if (assessmentReady && symptomAnalysis) {
        state.differentialDiagnosis = await generateAssessment(symptomAnalysis, engineHistory, latestMessage);
        if (state.differentialDiagnosis) {
          state.validation = await validateAssessment(state.differentialDiagnosis, symptomAnalysis);
          if (state.validation) {
            state.confidence = await assessConfidence(symptomAnalysis, state.differentialDiagnosis, state.validation, session.messages);
          }
        }
      } else if (symptomAnalysis) {
        state.followUp = await generateFollowUpQuestions(symptomAnalysis, engineHistory, latestMessage);
      }

      const systemContent = buildSystemPrompt(state);
      const response = await this.callLLM(systemContent, session.messages);

      if (state.confidence && state.confidence.confidenceScore !== undefined) {
        const safety = new SafetyFramework();
        const safetyResult = await safety.evaluate(response, {
          userId: userId || "unknown",
          conversationId: session.conversationId || sessionId,
          queryText: session.messages[session.messages.length - 1]?.content || "",
          patientData: state.symptomAnalysis ? {
            age: state.symptomAnalysis.clinicalProfile.age ? Number.parseInt(state.symptomAnalysis.clinicalProfile.age, 10) || undefined : undefined,
            sex: state.symptomAnalysis.clinicalProfile.gender || undefined,
            medications: state.symptomAnalysis.clinicalProfile.currentMedications,
            chronicConditions: state.symptomAnalysis.clinicalProfile.medicalHistory,
          } : undefined,
        });

        if (safetyResult.action === "block" && safetyResult.fallbackMessage) {
          await this.sendResponse(session, safetyResult.fallbackMessage, sessionId, userId, safetyResult);
          return;
        }

        await this.sendResponse(session, response, sessionId, userId, {
          overallStatus: safetyResult.overallStatus,
          action: safetyResult.action,
          scores: safetyResult.scores,
        });
        return;
      }

      await this.sendResponse(session, response, sessionId, userId);
    } catch (err) {
      logger.error({ err, sessionId }, "Voice engine processing error");
      session.send({ type: "error", message: "I encountered an error processing your request. Please try again." });
      session.state = "listening";
      session.send({ type: "state_change", state: "listening" });
    }
  }

  private buildEmergencyResponse(escalation: any): string {
    const parts: string[] = [
      "Your symptoms may require immediate medical attention.",
    ];
    if (escalation.reason) parts.push(escalation.reason);
    parts.push("Please seek emergency care now. If you are unable to travel safely, contact your local emergency services.");
    if (escalation.preparationInstructions?.length) {
      parts.push("While waiting for help:");
      parts.push(escalation.preparationInstructions.slice(0, 3).join(". "));
    }
    return parts.join(" ");
  }

  private async callLLM(systemContent: string, messages: { role: string; content: string }[]): Promise<string> {
    if (!groq) return "I'm sorry, the AI service is not available right now. Please try again later.";

    const completion = await groq.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemContent },
        ...messages.map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: m.content,
        })),
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    return completion.choices[0]?.message?.content || "I'm not sure how to respond. Could you provide more details?";
  }

  private async sendResponse(
    session: { send: (msg: ServerMessage) => void; messages: { role: string; content: string }[]; state: VoiceEngineState; turnCount: number },
    text: string,
    sessionId: string,
    userId?: string,
    safety?: any,
  ): Promise<void> {
    session.send({ type: "thinking" });

    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const chunk = words.slice(i, i + 3).join(" ");
      session.send({ type: "response_chunk", text: chunk + " " });
      await new Promise((r) => setTimeout(r, 60));
    }

    session.send({ type: "response_complete", text, safety });
    session.messages.push({ role: "assistant", content: text });

    await db.insert(voiceTranscriptsTable).values({
      sessionId,
      source: "ai",
      text,
      isFinal: true,
      turnNumber: (await this.getTurnCount(sessionId)) + 1,
    });

    await db.update(voiceSessionsTable)
      .set({ turnCount: session.turnCount })
      .where(eq(voiceSessionsTable.id, sessionId));

    session.state = "listening";
    session.send({ type: "state_change", state: "listening" });
  }

  private async getTurnCount(sessionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(voiceTranscriptsTable)
      .where(eq(voiceTranscriptsTable.sessionId, sessionId));
    return Number(result?.count || 0);
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.send({ type: "state_change", state: "idle" });
      this.sessions.delete(sessionId);
    }

    await db.update(voiceSessionsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(voiceSessionsTable.id, sessionId));

    logger.info({ sessionId }, "Voice session ended");
  }

  async getSession(sessionId: string): Promise<VoiceSession | null> {
    const rows = await db.select().from(voiceSessionsTable)
      .where(eq(voiceSessionsTable.id, sessionId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId || undefined,
      status: (row.status as VoiceSessionStatus) || "active",
      language: row.language || "en",
      mode: (row.mode as VoiceSession["mode"]) || "voice",
      turnCount: row.turnCount ?? 0,
      duration: row.duration ?? undefined,
      metadata: (row.metadata as Record<string, any>) ?? {},
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString(),
    };
  }

  async getTranscripts(sessionId: string): Promise<VoiceTranscript[]> {
    const rows = await db.select().from(voiceTranscriptsTable)
      .where(eq(voiceTranscriptsTable.sessionId, sessionId))
      .orderBy(voiceTranscriptsTable.createdAt);
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      source: r.source as "user" | "ai",
      text: r.text,
      originalText: r.originalText || undefined,
      confidence: r.confidence || undefined,
      turnNumber: r.turnNumber || 0,
      isFinal: r.isFinal ?? true,
      isEdited: r.isEdited ?? false,
      editedText: r.editedText || undefined,
      entities: r.entities as any,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
