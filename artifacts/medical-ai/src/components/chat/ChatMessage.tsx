import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, User, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
}

export function ChatMessage({ message, isLatest }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
            {message.content}
          </div>
        ) : (
          <div
            data-testid={`message-ai-${message.id}`}
            className="relative bg-card/70 border border-white/8 backdrop-blur-sm px-5 py-4 rounded-2xl rounded-bl-sm shadow-xl"
          >
            <div className="absolute inset-0 rounded-2xl rounded-bl-sm bg-gradient-to-br from-primary/3 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <MarkdownContent content={message.content} />
            </div>
          </div>
        )}

        {/* Timestamp + actions */}
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground/40 font-medium tabular-nums">
            {formatTime(message.timestamp)}
          </span>
          {!isUser && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
