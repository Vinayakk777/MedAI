import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { VoiceEngine } from "./lib/voice/voiceEngine";
import { getAuth } from "@clerk/express";
import type { ClientMessage, ServerMessage } from "./lib/voice/types";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = createServer(app);
const voiceEngine = new VoiceEngine();

// ─── WebSocket Server ───
const wss = new WebSocketServer({ server, path: "/ws/voice" });

wss.on("connection", (ws: WebSocket, req) => {
  let sessionId: string | null = null;
  let userId: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    const auth = getAuth(req as any);
    userId = auth?.userId || null;
  } catch {
    // Will handle via start_session message
  }

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
    else if (heartbeat) clearInterval(heartbeat);
  }, 30_000);

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString()) as ClientMessage;

      switch (data.type) {
        case "start_session":
          sessionId = await voiceEngine.createSession(
            userId || "anonymous",
            send,
            data.metadata?.language || "en",
            data.metadata?.mode || "voice",
          );
          send({ type: "session_ready", sessionId });
          break;

        case "end_session":
          if (sessionId) await voiceEngine.endSession(sessionId);
          sessionId = null;
          break;

        case "transcript_partial":
          if (!sessionId) { send({ type: "error", message: "No active session" }); return; }
          send({ type: "listening", text: data.text });
          break;

        case "transcript_final":
          if (!sessionId) { send({ type: "error", message: "No active session" }); return; }
          await voiceEngine.handleTranscript(sessionId, data.editedText || data.text, true);
          break;

        case "pause":
          send({ type: "state_change", state: "listening" });
          break;

        case "interrupt":
          send({ type: "state_change", state: "listening" });
          break;

        default:
          send({ type: "error", message: `Unknown message type: ${(data as any).type}` });
      }
    } catch (err) {
      logger.error({ err }, "WebSocket message handling error");
      send({ type: "error", message: "Failed to process message" });
    }
  });

  ws.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    if (sessionId) voiceEngine.endSession(sessionId).catch(() => {});
    logger.info({ sessionId, userId }, "WebSocket connection closed");
  });

  ws.on("error", (err) => {
    logger.error({ err }, "WebSocket error");
  });
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
