import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  User,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  Pause,
  Play,
  ImageIcon,
  RotateCcw,
} from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";

export type Attachment = {
  id: string;
  url: string;
  mimeType: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
};

export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isError?: boolean;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
  onRetry?: () => void;
}

function SpeakingEqualizer() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3.5 ml-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ scaleY: [0.35, 1, 0.35] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
          className="w-[3px] h-full rounded-full bg-primary origin-bottom"
        />
      ))}
    </span>
  );
}

export function ChatMessage({ message, isLatest, onRetry }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const speech = useSpeechSynthesis();
  const isUser = message.role === "user";
  const isSpeakingThis = speech.speakingId === message.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpeak = () => {
    if (!speech.supported) return;
    if (isSpeakingThis) {
      if (speech.paused) speech.resume();
      else speech.pause();
    } else {
      speech.speak(message.id, message.content);
    }
  };

  const speakerLabel = !speech.supported
    ? "Voice playback not supported in this browser"
    : isSpeakingThis && speech.paused
      ? "Resume AI response"
      : isSpeakingThis
        ? "Pause AI response"
        : "Play AI response";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
      className={`group flex items-end gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/60 to-teal-600/60 border border-primary/30 flex items-center justify-center flex-shrink-0 mb-1">
          <User className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
      ) : (
        <motion.div
          animate={
            isLatest
              ? { boxShadow: ["0 0 0 0 rgba(6,182,212,0.3)", "0 0 0 5px rgba(6,182,212,0)", "0 0 0 0 rgba(6,182,212,0)"] }
              : {}
          }
          transition={{ duration: 2, repeat: isLatest ? 2 : 0 }}
          className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mb-1"
        >
          <Activity className="w-3.5 h-3.5 text-primary" />
        </motion.div>
      )}

      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        {isUser ? (
          <div
            data-testid={`message-user-${message.id}`}
            className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-lg shadow-primary/10"
          >
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View attached image ${att.name}`}
                    className="block"
                  >
                    <img
                      src={att.url}
                      alt={att.name}
                      loading="lazy"
                      className="w-24 h-24 rounded-lg object-cover border border-white/20 shadow-md hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            )}
            {message.content && <span>{message.content}</span>}
          </div>
        ) : (
          <div
            data-testid={`message-ai-${message.id}`}
            className={`relative bg-card/70 border backdrop-blur-sm px-5 py-4 rounded-2xl rounded-bl-sm shadow-xl ${
              message.isError
                ? "border-rose-500/30"
                : "border-white/8"
            }`}
          >
            <div
              className={`absolute inset-0 rounded-2xl rounded-bl-sm ${
                message.isError
                  ? "bg-gradient-to-br from-rose-500/5 to-transparent"
                  : "bg-gradient-to-br from-primary/3 to-transparent"
              } pointer-events-none`}
            />
            <div className="relative z-10">
              {message.isError ? (
                <div className="flex items-start gap-2.5">
                  <VolumeX className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground leading-relaxed">{message.content}</p>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        aria-label="Retry message"
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-foreground bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <MarkdownContent content={message.content} />
              )}
            </div>
          </div>
        )}

        {/* Timestamp + actions */}
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground/40 font-medium tabular-nums">
            {formatTime(message.timestamp)}
          </span>
          {!isUser && (
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {speech.supported && !message.isError && (
                <button
                  onClick={toggleSpeak}
                  aria-label={speakerLabel}
                  title={speakerLabel}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                    isSpeakingThis
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  {isSpeakingThis ? (
                    speech.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />
                  ) : (
                    <Volume2 className="w-3 h-3" />
                  )}
                  <span>{isSpeakingThis ? (speech.paused ? "Resume" : "Pause") : "Listen"}</span>
                </button>
              )}
              {isSpeakingThis && <SpeakingEqualizer />}
              <button
                onClick={handleCopy}
                data-testid={`copy-message-${message.id}`}
                aria-label="Copy message"
                className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-all"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => setFeedback("up")}
                aria-label="Helpful"
                className={`p-1 rounded-md transition-all ${feedback === "up" ? "text-emerald-400" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5"}`}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => setFeedback("down")}
                aria-label="Not helpful"
                className={`p-1 rounded-md transition-all ${feedback === "down" ? "text-rose-400" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5"}`}
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function MessageAttachmentIcon({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
      <ImageIcon className="w-3 h-3" />
      {name}
    </span>
  );
}