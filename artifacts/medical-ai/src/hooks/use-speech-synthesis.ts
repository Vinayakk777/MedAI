import { useCallback, useEffect, useState } from "react";

type SpeechControllerState = {
  supported: boolean;
  /** id of the message currently being spoken (null when idle). */
  speakingId: string | null;
  paused: boolean;
  voices: TtsVoiceInfo[];
  preference: VoicePreference;
};

export type VoiceGender = "auto" | "female" | "male";
export type VoiceGuess = "female" | "male" | "unknown";

export type TtsVoiceInfo = {
  name: string;
  lang: string;
  gender: VoiceGuess;
};

export type VoicePreference = {
  gender: VoiceGender;
  /** Specific voice name; null = auto-pick by gender. */
  name: string | null;
};

const STORAGE_KEY = "medai-tts-voice";

const FEMALE_MARKERS = [
  "samantha", "victoria", "karen", "moira", "tessa", "ava", "susan", "zira",
  "hazel", "aria", "jenny", "michelle", "sarah", "stella", "allison", "serena",
  "emma", "kate", "fiona", "hannah", "olivia", "sophia", "zoey", "angela",
  "melina", "yuna", "female",
];

const MALE_MARKERS = [
  "david", "mark", "alex", "daniel", "george", "fred", "guy", "oliver", "james",
  "eric", "ryan", "aaron", "bruce", "tom", "steve", "lee", "jacob",
  "christopher", "william", "michael", "benjamin", "dylan", "male",
];

// Module-level singleton so only ONE AI message is ever spoken at a time,
// even across many ChatMessage component instances.
const listenerSet = new Set<() => void>();

let currentSpeakingId: string | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let pausedFlag = false;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let availableVoices: SpeechSynthesisVoice[] = [];
let voicePreference: VoicePreference = loadPreference();
let voicesLoaded = false;

const supported =
  typeof window !== "undefined" && "speechSynthesis" in window;

function loadPreference(): VoicePreference {
  if (typeof window === "undefined") return { gender: "auto", name: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VoicePreference;
      const gender: VoiceGender =
        parsed?.gender === "female" || parsed?.gender === "male"
          ? parsed.gender
          : "auto";
      return { gender, name: typeof parsed?.name === "string" ? parsed.name : null };
    }
  } catch {
    /* ignore */
  }
  return { gender: "auto", name: null };
}

function persistPreference() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voicePreference));
  } catch {
    /* ignore */
  }
}

function emit() {
  listenerSet.forEach((l) => l());
}

function clearKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function guessGender(voice: Pick<SpeechSynthesisVoice, "name">): VoiceGuess {
  const n = voice.name.toLowerCase();
  if (FEMALE_MARKERS.some((k) => n.includes(k))) return "female";
  if (MALE_MARKERS.some((k) => n.includes(k))) return "male";
  return "unknown";
}

function refreshVoices() {
  if (!supported) {
    availableVoices = [];
    emit();
    return;
  }
  availableVoices = window.speechSynthesis.getVoices() || [];
  voicesLoaded = true;
  emit();
}

function toVoiceInfo(v: SpeechSynthesisVoice): TtsVoiceInfo {
  return { name: v.name, lang: v.lang, gender: guessGender(v) };
}

function listVoices(): TtsVoiceInfo[] {
  if (!supported) return [];
  return availableVoices.map(toVoiceInfo);
}

function getPreference(): VoicePreference {
  return { ...voicePreference };
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!supported) return null;
  if (availableVoices.length === 0) {
    availableVoices = window.speechSynthesis.getVoices() || [];
  }
  const list = availableVoices;
  if (list.length === 0) return null;

  if (voicePreference.name) {
    const named = list.find((v) => v.name === voicePreference.name);
    if (named) return named;
  }

  const en = list.filter((v) => /^en/i.test(v.lang));
  const pool = en.length > 0 ? en : list;

  if (voicePreference.gender !== "auto") {
    const tagged = pool.map((v) => ({ v, g: guessGender(v) }));
    const match = tagged.find((t) => t.g === voicePreference.gender);
    if (match) return match.v;
    const localFallback = tagged.find((t) => t.g === "unknown" && t.v.localService);
    if (localFallback) return localFallback.v;
  }

  return pool[0] ?? null;
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

function setVoicePreference(gender: VoiceGender, name: string | null) {
  const resolvedName =
    name && availableVoices.some((v) => v.name === name) ? name : null;
  voicePreference = { gender, name: resolvedName };
  persistPreference();
  emit();
}

if (supported && typeof window !== "undefined") {
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
  // Kick the voices list (can be async in Chrome).
  setTimeout(() => {
    refreshVoices();
    if (voicePreference.name) {
      setVoicePreference(voicePreference.gender, voicePreference.name);
    }
  }, 0);
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechControllerState>(() => ({
    supported,
    speakingId: currentSpeakingId,
    paused: pausedFlag,
    voices: listVoices(),
    preference: getPreference(),
  }));

  useEffect(() => {
    const listener = () =>
      setState({
        supported,
        speakingId: currentSpeakingId,
        paused: pausedFlag,
        voices: listVoices(),
        preference: getPreference(),
      });
    listenerSet.add(listener);
    if (!voicesLoaded) refreshVoices();
    return () => {
      listenerSet.delete(listener);
    };
  }, []);

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
    voices: state.voices,
    preference: state.preference,
    speak: useCallback(speakSpeech, []),
    pause: useCallback(pauseSpeech, []),
    resume: useCallback(resumeSpeech, []),
    stop: useCallback(stopSpeech, []),
    setPreference: useCallback(setVoicePreference, []),
  };
}

/** Global control so navigating away stops playback immediately. */
export function stopAllSpeech() {
  stopSpeech();
}
