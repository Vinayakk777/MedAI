import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Check } from "lucide-react";
import {
  useSpeechSynthesis,
  type VoiceGender,
  type TtsVoiceInfo,
} from "@/hooks/use-speech-synthesis";

function genderLabel(gender: TtsVoiceInfo["gender"]): string {
  switch (gender) {
    case "female":
      return "Female";
    case "male":
      return "Male";
    default:
      return "Unknown";
  }
}

const PRESETS: { key: VoiceGender; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
];

export function VoicePicker() {
  const { supported, voices, preference, setPreference } = useSpeechSynthesis();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!supported) return null;

  const currentLabel = preference.name
    ? preference.name
    : preference.gender === "auto"
      ? "Auto"
      : preference.gender === "female"
        ? "Female"
        : "Male";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose voice for spoken replies"
        title={`Voice: ${currentLabel}`}
        className={`p-2 rounded-xl transition-all ${
          open
            ? "text-primary bg-white/8"
            : "text-muted-foreground/50 hover:text-foreground hover:bg-white/5"
        }`}
      >
        <AudioLines className="w-4.5 h-4.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-card border border-white/8 shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden z-[100]"
          >
            <div className="px-3 py-2.5 border-b border-white/5">
              <p className="text-xs font-semibold text-foreground">Spoken replies</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Choose who reads the AI responses out loud.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1 p-2 border-b border-white/5">
              {PRESETS.map((p) => {
                const active =
                  preference.gender === p.key && preference.name === null;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPreference(p.key, null)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="max-h-56 overflow-y-auto p-1.5">
              {voices.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/50">
                  Loading voices…
                </p>
              ) : (
                voices.map((v) => {
                  const active = preference.name === v.name;
                  return (
                    <button
                      key={v.name}
                      onClick={() => setPreference(v.gender === "unknown" ? "auto" : v.gender, v.name)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-medium truncate">{v.name}</span>
                        <span className="block text-[10px] text-muted-foreground/50 truncate">
                          {v.lang}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                            v.gender === "female"
                              ? "text-pink-400 border-pink-400/25 bg-pink-400/10"
                              : v.gender === "male"
                                ? "text-sky-400 border-sky-400/25 bg-sky-400/10"
                                : "text-muted-foreground/50 border-white/10 bg-white/5"
                          }`}
                        >
                          {genderLabel(v.gender)}
                        </span>
                        {active && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
