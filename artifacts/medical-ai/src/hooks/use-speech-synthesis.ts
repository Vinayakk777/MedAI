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

// Returns reader-friendly plain text for TTS: strips markdown formatting
// (bold/italic/headers/lists/code/links/images) so the voice does NOT read
// symbols like ** or #. Only human-readable words are spoken.
// Also converts medical abbreviations into natural spoken language.
function stripMarkdownForSpeech(text: string): string {
  if (!text) return "";

  let t = text
    // Images: ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Links: [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Inline code / backticks
    .replace(/`([^`]*)`/g, "$1")
    // Bold + italic combined: ***x*** -> x
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    // Bold: **x** -> x
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Italic: *x* -> x (single asterisks only, avoids mangling ordinary text)
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    // Strikethrough
    .replace(/~~([^~]+)~~/g, "$1")
    // Headers: # Heading -> Heading
    .replace(/^#{1,6}\s+/gm, "")
    // Blockquotes
    .replace(/^>\s?/gm, "")
    // Unordered list markers
    .replace(/^\s*[-*+]\s+/gm, "")
    // Ordered list markers "1." -> "1" (keep number for readability)
    .replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/\./, ". ").replace(/\s+/g, " "))
    // Code fences
    .replace(/```[\s\S]*?```/g, " ")
    // Horizontal rules
    .replace(/^\s*([-*_]\s?){3,}\s*$/gm, " ")
    // HTML tags (e.g. <br>, <strong>)
    .replace(/<[^>]+>/g, " ")
    // Collapse stray asterisks/backticks/# that survived
    .replace(/[*_`#>\[\]~]/g, "")
    // Normalize whitespace: collapse runs of spaces/newlines into single spaces
    .replace(/\s+/g, " ")
    .trim();

  // Convert medical abbreviations to natural spoken language
  t = convertMedicalAbbreviations(t);

  return t;
}

// Convert medical abbreviations and symbols into natural spoken language
function convertMedicalAbbreviations(text: string): string {
  return text
    // Heart rate: "82 bpm" -> "82 beats per minute"
    .replace(/(\d+)\s*bpm/gi, "$1 beats per minute")
    // Blood pressure: "120/80 mmHg" -> "120 over 80 millimeters of mercury"
    .replace(/(\d+\/\d+)\s*mmHg/gi, (_, bp) => {
      const [sys, dia] = bp.split("/");
      return `${sys} over ${dia} millimeters of mercury`;
    })
    // Oxygen saturation: "98% SpO2" or "98% SpO₂" -> "98 percent oxygen saturation"
    .replace(/(\d+)%?\s*SpO[₂2]/gi, "$1 percent oxygen saturation")
    .replace(/SpO[₂2]\s*(\d+)%?/gi, "$1 percent oxygen saturation")
    // Temperature: "37.0°C" -> "37 degrees Celsius" / "98.6°F" -> "98.6 degrees Fahrenheit"
    .replace(/(\d+\.?\d*)°C/gi, "$1 degrees Celsius")
    .replace(/(\d+\.?\d*)°F/gi, "$1 degrees Fahrenheit")
    // Blood glucose: "95 mg/dL" -> "95 milligrams per deciliter"
    .replace(/(\d+\.?\d*)\s*mg\/dL/gi, "$1 milligrams per deciliter")
    // Weight: "73 kg" -> "73 kilograms"
    .replace(/(\d+\.?\d*)\s*kg/gi, "$1 kilograms")
    // Height: "175 cm" -> "175 centimeters"
    .replace(/(\d+\.?\d*)\s*cm/gi, "$1 centimeters")
    // BMI: "BMI 24.5" -> "B M I 24.5" (keep readable)
    .replace(/\bBMI\b/gi, "B M I")
    // Common medical terms - keep simple for TTS
    .replace(/\bHR\b/gi, "heart rate")
    .replace(/\bBP\b/gi, "blood pressure")
    .replace(/\bRR\b/gi, "respiratory rate")
    .replace(/\bO2\b/gi, "oxygen")
    // Remove warning/recommendation symbols but keep text
    .replace(/[✓✔]\s*/g, "")
    .replace(/[⚠🚨]\s*/g, "")
    // Clean up extra spaces
    .replace(/\s+/g, " ")
    .trim();
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
  const plain = stripMarkdownForSpeech(text);
  if (!supported || !plain.trim()) return;

  // Only one response speaks at a time.
  if (currentSpeakingId !== null && currentSpeakingId !== id) {
    stopSpeech();
  }

  window.speechSynthesis.cancel();
  clearKeepAlive();

  const utterance = new SpeechSynthesisUtterance(plain);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 0.9;   // Slightly slower for calm, measured delivery
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

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
