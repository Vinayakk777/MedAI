export type VoiceSessionStatus = "active" | "paused" | "ended" | "cancelled";
export type TranscriptSource = "user" | "ai";
export type VoiceEngineState = "idle" | "listening" | "thinking" | "speaking" | "error";

// ─── Provider Interfaces ───

export interface STTProvider {
  readonly name: string;
  transcribe(audioBuffer: ArrayBuffer, options?: STTOptions): Promise<STTResult>;
  supportsRealTime: boolean;
  supportedLanguages: string[];
}

export interface STTOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  punctuation?: boolean;
  medicalMode?: boolean;
}

export interface STTResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  words?: { word: string; startTime: number; endTime: number; confidence: number }[];
  language?: string;
}

export interface TTSProvider {
  readonly name: string;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): void;
  isSpeaking: boolean;
  voices: TTSVoiceOption[];
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSVoiceOption {
  id: string;
  name: string;
  lang: string;
  isDefault: boolean;
}

export interface VADProvider {
  readonly name: string;
  isSpeaking(audioLevel: number): boolean;
  onSpeechStart: (() => void) | null;
  onSpeechEnd: (() => void) | null;
  threshold: number;
  silenceTimeoutMs: number;
}

// ─── Session Types ───

export interface VoiceSession {
  id: string;
  userId: string;
  conversationId?: string;
  status: VoiceSessionStatus;
  language: string;
  mode: "voice" | "text" | "hybrid";
  turnCount: number;
  duration?: number;
  metadata: Record<string, any>;
  startedAt: string;
  endedAt?: string;
}

export interface VoiceTranscript {
  id: string;
  sessionId: string;
  source: TranscriptSource;
  text: string;
  originalText?: string;
  confidence?: number;
  turnNumber: number;
  isFinal: boolean;
  isEdited: boolean;
  editedText?: string;
  entities?: Record<string, any>;
  createdAt: string;
}

export interface AudioChunk {
  id: string;
  sessionId: string;
  mimeType: string;
  duration?: number;
  data?: ArrayBuffer;
}

// ─── WebSocket Message Types ───

export type ClientMessage =
  | { type: "start_session"; metadata?: { language?: string; mode?: string } }
  | { type: "end_session" }
  | { type: "transcript_partial"; text: string }
  | { type: "transcript_final"; text: string; editedText?: string }
  | { type: "audio_chunk"; data: ArrayBuffer; mimeType: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "interrupt" };

export type ServerMessage =
  | { type: "session_ready"; sessionId: string }
  | { type: "thinking" }
  | { type: "response_chunk"; text: string }
  | { type: "response_complete"; text: string; safety?: any }
  | { type: "follow_up"; text: string }
  | { type: "listening"; text?: string }
  | { type: "error"; message: string; code?: string }
  | { type: "state_change"; state: VoiceEngineState }
  | { type: "transcript_ack"; transcriptId: string; turnNumber: number };

// ─── Engine Types ───

export interface VoiceEngineOptions {
  userId: string;
  language?: string;
  mode?: "voice" | "text" | "hybrid";
  conversationId?: string;
  onStateChange?: (state: VoiceEngineState) => void;
  onTranscript?: (transcript: VoiceTranscript) => void;
  onResponse?: (text: string) => void;
  onResponseComplete?: (text: string, safety?: any) => void;
  onError?: (error: string) => void;
}
