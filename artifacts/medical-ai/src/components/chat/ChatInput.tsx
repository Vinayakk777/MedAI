import { useRef, useEffect, useState, useCallback, KeyboardEvent, DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Paperclip, X, ImagePlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition, type VoiceErrorCode } from "@/hooks/use-speech-recognition";
import { MAX_ATTACHMENTS } from "@/lib/image";

export type PendingAttachment = {
  localId: string;
  file: Blob;
  name: string;
  previewUrl: string;
  width?: number;
  height?: number;
};

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  isUploading?: boolean;
  uploadProgress?: number | null;
  placeholder?: string;
  disabled?: boolean;
  attachments?: PendingAttachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (localId: string) => void;
  onTranscript?: (text: string) => void;
}

function voiceErrorMessage(code: VoiceErrorCode, brave: boolean): string {
  switch (code) {
    case "permission-denied":
      return "Microphone access was denied. Allow microphone access in your browser settings to use voice input.";
    case "no-speech":
      return "I couldn't hear any speech. Make sure your microphone is on and not muted, then try again.";
    case "network":
      return brave
        ? "Brave blocks the speech-recognition service for privacy, so voice input can't work here. Please open this site in Chrome or Edge to use voice input."
        : "Speech recognition hit a network error. Check your connection and try again.";
    case "audio-capture":
      return "No microphone was detected on this device.";
    case "unsupported":
      return "Voice input isn't supported in this browser. Try Chrome or Edge.";
    default:
      return "Voice input failed. Please try again.";
  }
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  isUploading = false,
  uploadProgress = null,
  placeholder = "Describe your symptoms or ask a health question...",
  disabled = false,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  onTranscript,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [interim, setInterim] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const { supported, status, isListening, isBrave, start, stop, cancel } = useSpeechRecognition({
    onResult: (text) => {
      setInterim("");
      if (onTranscript) onTranscript(text);
    },
    onInterim: (text) => setInterim(text),
    onError: (code) => {
      setInterim("");
      toast({ title: "Voice input", description: voiceErrorMessage(code, isBrave), variant: "destructive" });
    },
  });

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && !isUploading && !disabled && (value.trim() || attachments.length > 0)) onSubmit();
    }
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isLoading && !isUploading && !disabled;

  const handlePickFiles = useCallback(
    (files: FileList | File[]) => {
      if (!onAddFiles) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      const room = MAX_ATTACHMENTS - attachments.length;
      const accepted = list.slice(0, Math.max(0, room));
      if (accepted.length < list.length) {
        toast({ title: "Too many images", description: `You can attach up to ${MAX_ATTACHMENTS} images per message.`, variant: "destructive" });
      }
      if (accepted.length > 0) onAddFiles(accepted);
    },
    [onAddFiles, attachments.length, toast],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) handlePickFiles(files);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files) handlePickFiles(e.dataTransfer.files);
  };

  const toggleListening = () => {
    if (isListening) {
      stop();
      return;
    }
    if (!supported) {
      toast({ title: "Voice input", description: voiceErrorMessage("unsupported", isBrave), variant: "destructive" });
      return;
    }
    setInterim("");
    start();
  };

  const cancelListening = () => {
    cancel();
    setInterim("");
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <motion.div
          animate={{
            boxShadow:
              value.length > 0 || attachments.length > 0
                ? "0 0 0 1px rgba(6,182,212,0.25), 0 8px 32px rgba(0,0,0,0.3)"
                : "0 0 0 1px rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.2)",
          }}
          transition={{ duration: 0.2 }}
          className={`relative flex flex-col bg-card/80 backdrop-blur-sm border rounded-2xl overflow-hidden ${
            dragActive ? "border-primary/60" : "border-white/8"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex items-center gap-2.5 px-3 pt-3 pb-1 flex-wrap">
              <AnimatePresence initial={false}>
                {attachments.map((att) => (
                  <motion.div
                    key={att.localId}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="relative group/att"
                  >
                    <img
                      src={att.previewUrl}
                      alt="Attached medical image"
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 bg-white/5"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment?.(att.localId)}
                      aria-label="Remove attached image"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg hover:bg-rose-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <span className="text-[10px] text-muted-foreground/40 ml-1">
                {attachments.length}/{MAX_ATTACHMENTS}
              </span>
            </div>
          )}

          {/* Listening indicator */}
          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 pt-3">
                  <motion.span
                    animate={{ scale: [1, 1.35, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"
                  />
                  <span className="text-xs text-rose-400 font-medium">Listening…</span>
                  <button
                    type="button"
                    onClick={cancelListening}
                    aria-label="Cancel voice input"
                    className="ml-auto text-[11px] px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {interim && (
                  <p className="px-4 pt-1.5 text-xs text-muted-foreground/70 italic">
                    “{interim}”
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            rows={1}
            data-testid="input-chat-message"
            aria-label="Chat message input"
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50 min-h-[52px] max-h-[160px] leading-relaxed"
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={onFileInputChange}
                className="hidden"
                data-testid="input-image-upload"
              />
              <button
                type="button"
                aria-label="Upload medical image"
                title="Attach a medical image (JPG, PNG, WebP)"
                disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {attachments.length > 0 ? <ImagePlus className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
              </button>

              <button
                type="button"
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                data-testid="button-voice-input"
                onClick={toggleListening}
                disabled={disabled}
                className={`relative p-2 rounded-xl transition-all disabled:opacity-40 ${
                  isListening
                    ? "text-rose-400 bg-rose-500/10"
                    : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5"
                }`}
              >
                {isListening ? (
                  <>
                    <motion.span
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

              {!supported && (
                <span className="text-[10px] text-muted-foreground/30 hidden sm:inline">
                  Voice unsupported
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[10px] tabular-nums transition-colors ${value.length > 800 ? "text-amber-400" : "text-muted-foreground/30"}`}>
                {value.length > 0 ? `${value.length}` : ""}
              </span>

              <AnimatePresence mode="wait">
                {isLoading || isUploading ? (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {isUploading ? (uploadProgress != null ? `${uploadProgress}%` : "Uploading…") : ""}
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full"
                      />
                    </div>
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

          {/* Upload progress bar */}
          <AnimatePresence>
            {isUploading && uploadProgress != null && uploadProgress < 100 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-0.5 bg-primary/20"
              >
                <motion.div
                  className="h-full bg-primary"
                  animate={{ width: `${Math.max(uploadProgress, 2)}%` }}
                  transition={{ duration: 0.2 }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="text-center text-[11px] text-muted-foreground/30 mt-2.5 leading-relaxed">
          MedAI may make mistakes. Verify important information with your physician. &middot;{" "}
          <span className="text-primary/50">Shift+Enter</span> for new line &middot;{" "}
          <span className="text-primary/50">Images analysed for information only — never a diagnosis</span>
        </p>
      </div>
    </div>
  );
}