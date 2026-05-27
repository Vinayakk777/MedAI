import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Paperclip } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = "Describe your symptoms or ask a health question...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <motion.div
          animate={{
            boxShadow: value.length > 0
              ? "0 0 0 1px rgba(6,182,212,0.25), 0 8px 32px rgba(0,0,0,0.3)"
              : "0 0 0 1px rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.2)",
          }}
          transition={{ duration: 0.2 }}
          className="relative flex flex-col bg-card/80 backdrop-blur-sm border border-white/8 rounded-2xl overflow-hidden"
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            data-testid="input-chat-message"
            aria-label="Chat message input"
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50 min-h-[52px] max-h-[160px] leading-relaxed"
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Attach file"
                className="p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-all"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                aria-label={isListening ? "Stop listening" : "Voice input"}
                data-testid="button-voice-input"
                onClick={() => setIsListening((v) => !v)}
                className={`relative p-2 rounded-xl transition-all ${
                  isListening
                    ? "text-rose-400 bg-rose-500/10"
                    : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5"
                }`}
              >
                {isListening ? (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="absolute inset-0 rounded-xl bg-rose-500"
                    />
                    <MicOff className="w-4 h-4 relative z-10" />
                  </>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {isListening && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-rose-400 font-medium"
                >
                  Listening...
                </motion.span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[10px] tabular-nums transition-colors ${value.length > 800 ? "text-amber-400" : "text-muted-foreground/30"}`}>
                {value.length > 0 ? `${value.length}` : ""}
              </span>

              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full"
                    />
                  </motion.div>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    whileHover={canSend ? { scale: 1.05 } : {}}
                    whileTap={canSend ? { scale: 0.95 } : {}}
                    type="button"
                    onClick={() => canSend && onSubmit()}
                    disabled={!canSend}
                    data-testid="button-send-message"
                    aria-label="Send message"
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
                      canSend
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                        : "bg-white/5 text-muted-foreground/30 cursor-not-allowed"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <p className="text-center text-[11px] text-muted-foreground/30 mt-2.5 leading-relaxed">
          MedAI may make mistakes. Verify important information with your physician. &middot; <span className="text-primary/50">Shift+Enter</span> for new line
        </p>
      </div>
    </div>
  );
}
