import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the (non-standard) Web Speech API.
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceErrorCode =
  | "permission-denied"
  | "no-speech"
  | "network"
  | "audio-capture"
  | "service-not-allowed"
  | "aborted"
  | "unsupported"
  | "unknown";

export type VoiceStatus =
  | "unsupported"
  | "idle"
  | "listening"
  | "processing"
  | "error";

interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Called once with the complete final transcription when recognition ends. */
  onResult: (transcript: string) => void;
  /** Called with partial (interim) results while the user is still speaking. */
  onInterim?: (text: string) => void;
  onError?: (code: VoiceErrorCode) => void;
  onStatusChange?: (status: VoiceStatus) => void;
}

export function useSpeechRecognition({
  lang = "en-US",
  onResult,
  onInterim,
  onError,
  onStatusChange,
}: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [status, setStatus] = useState<VoiceStatus>(() =>
    getRecognitionCtor() ? "idle" : "unsupported",
  );
  const finalRef = useRef<string[]>([]);
  const interimRef = useRef<string>("");
  const startLockRef = useRef(false);

  const supported = getRecognitionCtor() !== null;

  const setCurrentStatus = useCallback(
    (next: VoiceStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const cancelRef = useRef<() => void>(() => {});

  const start = useCallback(() => {
    if (startLockRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setCurrentStatus("unsupported");
      onError?.("unsupported");
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    finalRef.current = [];
    interimRef.current = "";

    rec.onstart = () => {
      setCurrentStatus("listening");
    };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalRef.current.push(transcript);
        } else {
          interim += transcript;
        }
      }
      interimRef.current = interim;
      onInterim?.(interim.trim());
    };

    rec.onerror = (event) => {
      const code = mapError(event.error);
      if (code === "aborted") return; // user-initiated stop/cancel
      setCurrentStatus("error");
      onError?.(code);
    };

    rec.onend = () => {
      startLockRef.current = false;
      setCurrentStatus("idle");
      const joined = finalRef.current.join(" ").trim();
      if (joined) {
        onResult(joined);
      } else if (!interimRef.current.trim()) {
        onError?.("no-speech");
      }
      recognitionRef.current = null;
    };

    startLockRef.current = true;
    recognitionRef.current = rec;
    cancelRef.current = () => {
      finalRef.current = [];
      rec.abort();
    };

    try {
      rec.start();
    } catch {
      startLockRef.current = false;
      setCurrentStatus("idle");
      onError?.("unknown");
    }
  }, [lang, onError, onInterim, onResult, setCurrentStatus]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current();
    cancelRef.current = () => {};
  }, []);

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
      recognitionRef.current = null;
    };
  }, []);

  return {
    supported,
    status,
    isListening: status === "listening" || status === "processing",
    start,
    stop,
    cancel,
  };
}

function mapError(error: string): VoiceErrorCode {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "audio-capture":
      return "audio-capture";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}