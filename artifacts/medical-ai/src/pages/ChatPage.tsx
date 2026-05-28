import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChatSidebar, type ServerConversation } from "@/components/chat/ChatSidebar";
import { ChatMessage, type Message } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageSkeleton } from "@/components/chat/MessageSkeleton";

type ServerMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const MIN_TYPING_MS = 900;

function toClientMsg(m: ServerMessage): Message {
  return {
    id: m.id,
    role: m.role === "assistant" ? "ai" : "user",
    content: m.content,
    timestamp: new Date(m.createdAt),
  };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

export default function ChatPage() {
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---------- queries ----------

  const { data: conversations = [], isLoading: convsLoading } = useQuery<ServerConversation[]>({
    queryKey: ["conversations"],
    queryFn: () => apiFetch("/api/conversations"),
  });

  const { data: convData, isLoading: msgsLoading } = useQuery<
    ServerConversation & { messages: ServerMessage[] }
  >({
    queryKey: ["conversation", activeConvId],
    queryFn: () => apiFetch(`/api/conversations/${activeConvId}`),
    enabled: !!activeConvId,
  });

  useEffect(() => {
    if (convData?.messages) {
      setMessages(convData.messages.map(toClientMsg));
    }
  }, [convData]);

  // ---------- mutations ----------

  const createConv = useMutation({
    mutationFn: (title: string) =>
      apiFetch<ServerConversation>("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const deleteConv = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    },
  });

  const renameConv = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<ServerConversation>(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const sendMsg = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiFetch<{ userMessage: ServerMessage; aiMessage: ServerMessage }>(
        `/api/conversations/${id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      ),
  });

  // ---------- handlers ----------

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      let convId = activeConvId;
      if (!convId) {
        try {
          const conv = await createConv.mutateAsync("New Conversation");
          convId = conv.id;
          setActiveConvId(convId);
        } catch {
          return;
        }
      }

      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "user", content: trimmed, timestamp: new Date() },
      ]);
      setInput("");
      setIsTyping(true);
      const start = Date.now();

      try {
        const { userMessage, aiMessage } = await sendMsg.mutateAsync({
          id: convId,
          content: trimmed,
        });

        const elapsed = Date.now() - start;
        if (elapsed < MIN_TYPING_MS) {
          await new Promise((r) => setTimeout(r, MIN_TYPING_MS - elapsed));
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          toClientMsg(userMessage),
          toClientMsg(aiMessage),
        ]);
        setIsTyping(false);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setIsTyping(false);
      }
    },
    [isTyping, activeConvId, createConv, sendMsg, queryClient],
  );

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setIsTyping(false);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeConvId) return;
      setActiveConvId(id);
      setMessages([]);
    },
    [activeConvId],
  );

  // ---------- derived ----------

  const activeTitle =
    convData?.title ??
    conversations.find((c) => c.id === activeConvId)?.title;

  const isEmpty = messages.length === 0 && !isTyping;
  const isLoadingMessages = !!activeConvId && msgsLoading;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
            className="flex-shrink-0 overflow-hidden"
          >
            <ChatSidebar
              conversations={conversations}
              isLoading={convsLoading}
              activeId={activeConvId}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onDelete={(id) => deleteConv.mutate(id)}
              onRename={(id, title) => renameConv.mutate({ id, title })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Emergency Banner */}
        <div className="flex-shrink-0 bg-rose-500/8 border-b border-rose-500/12 px-4 py-2 flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span className="text-xs text-rose-400/80 font-medium">
            For emergencies, call <strong className="text-rose-400">911</strong> immediately.
            MedAI is not a substitute for emergency care.
          </span>
        </div>

        {/* Header */}
        <header className="flex-shrink-0 h-[56px] border-b border-white/5 flex items-center justify-between px-4 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              data-testid="button-toggle-sidebar"
              aria-label="Toggle sidebar"
              className="p-1.5 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4.5 h-4.5" />
              ) : (
                <PanelLeftOpen className="w-4.5 h-4.5" />
              )}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {activeTitle ?? "New Conversation"}
              </span>
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/15 px-2 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Online
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-primary font-medium">MedAI v2.0</span>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingMessages ? (
            <div className="max-w-3xl mx-auto px-4 pt-8">
              <MessageSkeleton />
            </div>
          ) : isEmpty ? (
            <EmptyState onSelect={(prompt) => sendMessage(prompt)} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLatest={i === messages.length - 1 && msg.role === "ai"}
                  />
                ))}
              </AnimatePresence>

              <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-md border-t border-white/5">
          {!isEmpty && !isLoadingMessages && (
            <div className="max-w-3xl mx-auto px-4 pt-3">
              <SuggestionChips onSelect={(label) => setInput(label)} />
            </div>
          )}
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => sendMessage(input)}
            isLoading={isTyping}
          />
        </div>
      </div>
    </div>
  );
}
