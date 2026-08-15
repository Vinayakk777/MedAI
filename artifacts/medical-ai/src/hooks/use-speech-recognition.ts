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

// Brave exposes the SpeechRecognition API but blocks the connection to Google's
// transcription service, so recognitions always fail with a "network" error.
export function isBraveBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as unknown as {
    brave?: { isBrave?: unknown };
  };
  return typeof nav.brave?.isBrave === "function";
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

// Chrome's speech service can fail on the very first start after the user
// grants microphone permission. Automatically retry once before surfacing an
// error to avoid "couldn't hear any speech" on a healthy mic.
const MAX_RETRIES = 1;
// Stop listening once the user has been silent this long after speaking.
const SILENCE_TIMEOUT_MS = 2600;
// If the mic opened but no speech was ever detected, bail out after this long.
const NO_AUDIO_TIMEOUT_MS = 12000;

function mediaErrorCode(err: unknown): VoiceErrorCode {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "permission-denied";
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "OverconstrainedError"
  ) {
    return "audio-capture";
  }
  return "unknown";
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
  const braveRef = useRef(isBraveBrowser());
  const finalRef = useRef<string[]>([]);
  const interimRef = useRef<string>("");
  const startLockRef = useRef(false);
  const cancelledRef = useRef(false);
  const restartingRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastAudioAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = getRecognitionCtor() !== null;

  const setCurrentStatus = useCallback(
    (next: VoiceStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // Auto-stops on a natural pause after speech, and handles the "never heard
  // anything" case with a single service retry before giving up.
  const runWatchdog = useCallback(() => {
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      const rec = recognitionRef.current;
      if (!rec) return;
      const now = Date.now();
      if (lastAudioAtRef.current > 0) {
        // Heard speech earlier — auto-stop after a natural pause.
        if (now - lastAudioAtRef.current > SILENCE_TIMEOUT_MS) {
          stopWatchdog();
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
        }
      } else if (now - startedAtRef.current > NO_AUDIO_TIMEOUT_MS) {
        // No speech at all. Try the service again once before giving up.
        stopWatchdog();
        if (!cancelledRef.current && retryCountRef.current < MAX_RETRIES && !braveRef.current) {
          retryCountRef.current += 1;
          restartingRef.current = true;
          try {
            rec.abort();
          } catch {
            restartingRef.current = false;
          }
        } else if (!cancelledRef.current) {
          cancelledRef.current = true;
          try {
            rec.abort();
          } catch {
            /* ignore */
          }
          onError?.("no-speech");
        }
      }
    }, 250);
  }, [onError, stopWatchdog]);

  // Launches a fresh recognition session. Used both for the initial start and
  // for the automatic retry after a recoverable speech-service failure.
  const createRecognizer = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      startLockRef.current = false;
      setCurrentStatus("unsupported");
      onError?.("unsupported");
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => {
      setCurrentStatus("listening");
      runWatchdog();
    };

    rec.onresult = (event) => {
      let interim = "";
      let captured = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalRef.current.push(transcript);
          if (transcript.trim()) captured = true;
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) captured = true;
      if (captured) lastAudioAtRef.current = Date.now();
      interimRef.current = interim;
      onInterim?.(interim.trim());
    };

    rec.onerror = (event) => {
      const code = mapError(event.error);
      if (code === "aborted") return; // user-initiated stop/retry
      if (
        !cancelledRef.current &&
        retryCountRef.current < MAX_RETRIES &&
        !braveRef.current &&
        (code === "no-speech" || code === "network" || code === "audio-capture")
      ) {
        // Keep the UI in "listening" while the service restarts.
        setCurrentStatus("listening");
        retryCountRef.current += 1;
        restartingRef.current = true;
        try {
          rec.abort();
        } catch {
          restartingRef.current = false;
        }
        return;
      }
      cancelledRef.current = true;
      stopWatchdog();
      setCurrentStatus("error");
      onError?.(code);
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return; // stale session
      stopWatchdog();
      if (restartingRef.current) {
        restartingRef.current = false;
        try {
          createRecognizer();
        } catch {
          startLockRef.current = false;
          setCurrentStatus("error");
          onError?.("unknown");
        }
        return;
      }
      startLockRef.current = false;
      setCurrentStatus("idle");
      if (!cancelledRef.current) {
        const joined = finalRef.current.join(" ").trim();
        const fallback = interimRef.current.trim();
        if (joined || fallback) {
          onResult(joined || fallback);
        } else {
          onError?.("no-speech");
        }
      }
      recognitionRef.current = null;
    };

    try {
      rec.start();
    } catch {
      restartingRef.current = false;
      startLockRef.current = false;
      stopWatchdog();
      setCurrentStatus("idle");
      onError?.("unknown");
    }
  }, [lang, onError, onInterim, onResult, runWatchdog, setCurrentStatus, stopWatchdog]);

  const start = useCallback(async () => {
    if (startLockRef.current || cancelledRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setCurrentStatus("unsupported");
      onError?.("unsupported");
      return;
    }

    startLockRef.current = true;
    setCurrentStatus("processing");

    // Preflight the microphone so a broken/denied mic surfaces a precise error
    // (and the browser grants the permission on first tap) instead of a vague
    // "no speech". We release the stream immediately — Chrome's recognition
    // opens its own capture after this.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      startLockRef.current = false;
      setCurrentStatus("idle");
      onError?.(mediaErrorCode(err));
      return;
    }

    if (!startLockRef.current) return; // cancelled while awaiting permission

    // Brave ships the API but can never transcribe (it refuses to send audio
    // to Google's service). Fail fast with a clear error instead of a retry
    // loop that always ends in a "network" error.
    if (braveRef.current) {
      startLockRef.current = false;
      setCurrentStatus("error");
      onError?.("network");
      return;
    }

    finalRef.current = [];
    interimRef.current = "";
    cancelledRef.current = false;
    restartingRef.current = false;
    retryCountRef.current = 0;
    lastAudioAtRef.current = 0;
    startedAtRef.current = Date.now();
    recognitionRef.current = null;

    createRecognizer();
  }, [createRecognizer, onError, setCurrentStatus]);

  const stop = useCallback(() => {
    stopWatchdog();
    cancelledRef.current = false;
    const rec = recognitionRef.current;
    if (!rec) {
      // Still awaiting the permission preflight — cancel it.
      startLockRef.current = false;
      cancelledRef.current = true;
      return;
    }
    try {
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }, [stopWatchdog]);

  const cancel = useCallback(() => {
    stopWatchdog();
    cancelledRef.current = true;
    startLockRef.current = false;
    finalRef.current = [];
    interimRef.current = "";
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }, [stopWatchdog]);

  useEffect(() => {
    return () => {
      stopWatchdog();
      cancelledRef.current = true;
      restartingRef.current = false;
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
  }, [stopWatchdog]);

  return {
    supported,
    isBrave: braveRef.current,
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