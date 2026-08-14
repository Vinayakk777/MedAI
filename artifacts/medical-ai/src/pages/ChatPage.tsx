import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, PanelLeftClose, PanelLeftOpen, Sparkles, LayoutDashboard, LogOut, UserRound, Sun, Moon, Trash2 } from "lucide-react";
import { ProfileModal } from "@/components/profile/ProfileModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser, useClerk } from "@clerk/react";
import { ChatSidebar, type ServerConversation } from "@/components/chat/ChatSidebar";
import { ChatMessage, type Message, type Attachment } from "@/components/chat/ChatMessage";
import { ChatInput, type PendingAttachment } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageSkeleton } from "@/components/chat/MessageSkeleton";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { stopAllSpeech } from "@/hooks/use-speech-synthesis";
import {
  prepareImage,
  uploadImages,
  MAX_ATTACHMENTS,
  type UploadedAttachment,
} from "@/lib/image";

type ServerMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: Attachment[];
};

function toClientMsg(m: ServerMessage): Message {
  return {
    id: m.id,
    role: m.role === "assistant" ? "ai" : "user",
    content: m.content,
    timestamp: new Date(m.createdAt),
    attachments: m.attachments && m.attachments.length > 0 ? m.attachments : undefined,
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function ChatUserNav() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials =
    user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "U";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl hover:bg-white/5 transition-colors"
      >
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="w-7 h-7 rounded-full object-cover ring-2 ring-primary/30"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-semibold">
            {initials}
          </div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-card border border-white/8 shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden z-[100]"
          >
            <div className="px-3 py-2.5 border-b border-white/5">
              <p className="text-xs font-semibold text-foreground truncate">
                {user?.fullName ??
                  user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
                  "Account"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
            </div>
            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Link>
              <button
                onClick={() => { setOpen(false); setShowProfile(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                <UserRound className="w-3.5 h-3.5" />
                Edit profile
              </button>
            </div>
            <div className="border-t border-white/5 py-1">
              <button
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/8 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </div>
  );
}

const AI_ERROR_MESSAGE =
  "Sorry, I couldn't complete that request. This can happen if the AI service is temporarily unavailable. Please try again.";

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Pending (not yet uploaded) attachments for the composer.
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const retryPayloadRef = useRef<{ text: string; attachments: Attachment[] } | null>(null);
  const failedUserMessageIdRef = useRef<string | null>(null);

  // Synchronous lock — prevents Enter-repeat / double-click from creating
  // multiple conversations before isTyping's async state update lands.
  const sendingRef = useRef(false);

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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const prev = queryClient.getQueryData<ServerConversation[]>(["conversations"]);
      if (prev) {
        queryClient.setQueryData(
          ["conversations"],
          prev.filter((c) => c.id !== id),
        );
      }
      return { prev };
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["conversations"], ctx.prev);
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    },
    onSuccess: (_data, id) => {
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

  // ---------- attachments ----------

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const added: PendingAttachment[] = [];
      for (const file of files) {
        try {
          const prepared = await prepareImage(file);
          const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const previewUrl = URL.createObjectURL(prepared.blob);
          added.push({
            localId,
            file: prepared.blob,
            name: prepared.name,
            previewUrl,
            width: prepared.width,
            height: prepared.height,
          });
        } catch (err) {
          toast({
            title: "Image not added",
            description: err instanceof Error ? err.message : "Could not read this image.",
            variant: "destructive",
          });
        }
      }
      if (added.length > 0) {
        setPendingAttachments((prev) => [...prev, ...added].slice(0, MAX_ATTACHMENTS));
      }
    },
    [toast],
  );

  const handleRemoveAttachment = useCallback((localId: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      stopAllSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- scroll ----------

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // ---------- streaming send ----------

  const sendMessage = useCallback(
    async (text: string, preUploaded?: Attachment[]) => {
      const trimmed = text.trim();
      const usePending = !preUploaded;
      const pending = usePending ? pendingAttachments : [];
      const hasContent = trimmed.length > 0 || pending.length > 0 || (preUploaded && preUploaded.length > 0);
      if (!hasContent || isTyping || sendingRef.current || (usePending && isUploading)) return;

      // Hold the lock synchronously so a second submit can't re-enter.
      sendingRef.current = true;

      let convId = activeConvId;
      if (!convId) {
        try {
          const conv = await createConv.mutateAsync("New Conversation");
          convId = conv.id;
          setActiveConvId(convId);
        } catch {
          sendingRef.current = false;
          return;
        }
      }

      // Upload any pending images (with progress) before sending the message.
      let serverAttachments: Attachment[] = preUploaded ?? [];
      if (usePending && pending.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);
        try {
          const uploaded: UploadedAttachment[] = await uploadImages(
            pending.map((a) => ({ blob: a.file, name: a.name, mimeType: a.file.type })),
            (pct) => setUploadProgress(pct),
          );
          serverAttachments = uploaded.map((u) => ({
            id: u.id,
            url: u.url,
            mimeType: u.mimeType,
            name: u.name,
            size: u.size,
          }));
          pending.forEach((a) => URL.revokeObjectURL(a.previewUrl));
          setPendingAttachments([]);
        } catch (err) {
          setIsUploading(false);
          setUploadProgress(null);
          sendingRef.current = false;
          toast({
            title: "Upload failed",
            description: err instanceof Error ? err.message : "Could not upload the image.",
            variant: "destructive",
          });
          return;
        }
        setIsUploading(false);
        setUploadProgress(null);
      }

      const tempUserId = `temp-user-${Date.now()}`;
      const tempAiId = `temp-ai-${Date.now()}`;

      // If a previous attempt failed, reuse its user message instead of adding a duplicate.
      const reuseUserMessageId = failedUserMessageIdRef.current;

      setMessages((prev) => {
        if (reuseUserMessageId) {
          return [
            ...prev.filter((m) => m.id !== reuseUserMessageId && !m.isError),
            {
              id: reuseUserMessageId,
              role: "user" as const,
              content: trimmed,
              timestamp: new Date(),
              attachments: serverAttachments.length > 0 ? serverAttachments : undefined,
            },
          ];
        }
        return [
          ...prev,
          {
            id: tempUserId,
            role: "user" as const,
            content: trimmed,
            timestamp: new Date(),
            attachments: serverAttachments.length > 0 ? serverAttachments : undefined,
          },
        ];
      });
      failedUserMessageIdRef.current = null;
      setInput("");
      setIsTyping(true);

      retryPayloadRef.current = { text: trimmed, attachments: serverAttachments };

      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            attachments: serverAttachments.map((a) => ({ id: a.id })),
          }),
        });

        if (!res.ok || !res.body) {
          const errBody = await res.text().catch(() => "");
          throw new Error(errBody || `API ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let aiContent = "";
        let hasStartedStreaming = false;
        let donePayload: { userMessage: ServerMessage; aiMessage: ServerMessage } | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;

            let parsed: any;
            try {
              parsed = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (parsed.content !== undefined) {
              aiContent += parsed.content;
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsTyping(false);
                setMessages((prev) => [
                  ...prev,
                  { id: tempAiId, role: "ai" as const, content: aiContent, timestamp: new Date() },
                ]);
              } else {
                setMessages((prev) =>
                  prev.map((m) => (m.id === tempAiId ? { ...m, content: aiContent } : m)),
                );
              }
            }

            if (parsed.done && parsed.userMessage && parsed.aiMessage) {
              donePayload = parsed as { userMessage: ServerMessage; aiMessage: ServerMessage };
            }

            if (parsed.error) {
              throw new Error(parsed.error);
            }
          }
        }

        if (donePayload) {
          setMessages((prev) => [
            ...prev.filter(
              (m) =>
                m.id !== tempUserId &&
                m.id !== tempAiId &&
                m.id !== reuseUserMessageId,
            ),
            toClientMsg(donePayload!.userMessage),
            toClientMsg(donePayload!.aiMessage),
          ]);
          retryPayloadRef.current = null;
        }
        setIsTyping(false);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch {
        const userMsgId = `failed-user-${Date.now()}`;
        failedUserMessageIdRef.current = userMsgId;
        setMessages((prev) => [
          ...prev.filter(
            (m) =>
              m.id !== tempUserId &&
              m.id !== tempAiId &&
              m.id !== reuseUserMessageId &&
              !m.isError,
          ),
          {
            id: userMsgId,
            role: "user" as const,
            content: trimmed,
            timestamp: new Date(),
            attachments: serverAttachments.length > 0 ? serverAttachments : undefined,
          },
          {
            id: `err-${Date.now()}`,
            role: "ai" as const,
            content: AI_ERROR_MESSAGE,
            timestamp: new Date(),
            isError: true,
          },
        ]);
        setIsTyping(false);
        toast({
          title: "Something went wrong",
          description: "Your message couldn't be sent. You can retry.",
          variant: "destructive",
        });
      } finally {
        sendingRef.current = false;
      }
    },
    [isTyping, activeConvId, createConv, queryClient, toast, pendingAttachments, isUploading],
  );

  const handleRetry = useCallback(() => {
    const payload = retryPayloadRef.current;
    if (!payload) return;
    sendMessage(payload.text, payload.attachments);
  }, [sendMessage]);

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setIsTyping(false);
    failedUserMessageIdRef.current = null;
    retryPayloadRef.current = null;
    pendingAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setPendingAttachments([]);
    stopAllSpeech();
  }, [pendingAttachments]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeConvId) return;
      setActiveConvId(id);
      setMessages([]);
      failedUserMessageIdRef.current = null;
      retryPayloadRef.current = null;
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
            For emergencies, call <strong className="text-rose-400">108</strong> immediately.
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

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-primary font-medium">MedAI v2.0</span>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {activeConvId && (
              <button
                onClick={() => {
                  if (window.confirm("Delete this conversation?")) {
                    deleteConv.mutate(activeConvId);
                  }
                }}
                disabled={deleteConv.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-rose-400/90 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 hover:text-rose-300 transition-colors disabled:opacity-50"
                aria-label="Delete current conversation"
                title="Delete this conversation"
                data-testid="button-delete-active-chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            <ChatUserNav />
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
                    onRetry={msg.isError ? handleRetry : undefined}
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
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            attachments={pendingAttachments}
            onAddFiles={(files) => handleAddFiles(files)}
            onRemoveAttachment={handleRemoveAttachment}
            onTranscript={(text) => {
              setInput((prev) => (prev ? `${prev} ${text}` : text));
            }}
          />
        </div>
      </div>
    </div>
  );
}