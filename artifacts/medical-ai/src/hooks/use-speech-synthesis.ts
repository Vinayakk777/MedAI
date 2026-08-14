import { useCallback, useEffect, useState } from "react";

type SpeechControllerState = {
  supported: boolean;
  /** id of the message currently being spoken (null when idle). */
  speakingId: string | null;
  paused: boolean;
};

// Module-level singleton so only ONE AI message is ever spoken at a time,
// even across many ChatMessage component instances.
const listenerSet = new Set<() => void>();

let currentSpeakingId: string | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let pausedFlag = false;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

const supported =
  typeof window !== "undefined" && "speechSynthesis" in window;

function emit() {
  listenerSet.forEach((l) => l());
}

function clearKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!supported) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const preferred =
    voices.find((v) => v.lang?.toLowerCase().startsWith("en-us") && v.localService) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith("en-us")) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ??
    null;
  return preferred;
}

function keepAlive() {
  // Chrome workaround: speechSynthesis auto-pauses after ~15s of speech.
  if (supported && currentSpeakingId && !pausedFlag) {
    window.speechSynthesis.resume();
  }
}

function stopSpeech() {
  if (!supported) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
  clearKeepAlive();
  if (currentSpeakingId !== null) {
    currentSpeakingId = null;
    pausedFlag = false;
    emit();
  }
}

function speakSpeech(id: string, text: string) {
  if (!supported || !text.trim()) return;

  // Only one response speaks at a time.
  if (currentSpeakingId !== null && currentSpeakingId !== id) {
    stopSpeech();
  }

  window.speechSynthesis.cancel();
  clearKeepAlive();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onend = () => {
    currentUtterance = null;
    clearKeepAlive();
    if (currentSpeakingId === id) {
      currentSpeakingId = null;
      pausedFlag = false;
      emit();
    }
  };
  utterance.onerror = () => {
    currentUtterance = null;
    clearKeepAlive();
    if (currentSpeakingId === id) {
      currentSpeakingId = null;
      pausedFlag = false;
      emit();
    }
  };

  currentUtterance = utterance;
  currentSpeakingId = id;
  pausedFlag = false;
  window.speechSynthesis.speak(utterance);
  keepAliveTimer = setInterval(keepAlive, 10_000);
  emit();
}

function pauseSpeech() {
  if (!supported || currentSpeakingId === null) return;
  window.speechSynthesis.pause();
  pausedFlag = true;
  emit();
}

function resumeSpeech() {
  if (!supported || currentSpeakingId === null) return;
  window.speechSynthesis.resume();
  pausedFlag = false;
  emit();
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechControllerState>({
    supported,
    speakingId: currentSpeakingId,
    paused: pausedFlag,
  });

  useEffect(() => {
    const listener = () =>
      setState({ supported, speakingId: currentSpeakingId, paused: pausedFlag });
    listenerSet.add(listener);
    return () => {
      listenerSet.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    // Preload the voice list (comes in asynchronously in some browsers).
    window.speechSynthesis.getVoices();
    const onVoices = () => {
      /* voice selection happens at speak-time */
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    return () =>
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
  }, [supported]);

  useEffect(() => {
    // Stop speech on unmount of the app shell.
    return () => {
      if (currentSpeakingId !== null) stopSpeech();
    };
  }, []);

  return {
    supported,
    speakingId: state.speakingId,
    paused: state.paused,
    speak: useCallback(speakSpeech, []),
    pause: useCallback(pauseSpeech, []),
    resume: useCallback(resumeSpeech, []),
    stop: useCallback(stopSpeech, []),
  };
}

/** Global control so navigating away stops playback immediately. */
export function stopAllSpeech() {
  stopSpeech();
}