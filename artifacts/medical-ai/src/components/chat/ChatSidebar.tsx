import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Activity,
  PlusCircle,
  MessageSquare,
  ArrowLeft,
  Trash2,
  Pencil,
  Search,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ServerConversation = {
  id: string;
  title: string;
  lastMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

interface ChatSidebarProps {
  conversations: ServerConversation[];
  isLoading?: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Last 7 Days";
  return "Older";
}

function groupConversations(convs: ServerConversation[]) {
  const order = ["Today", "Yesterday", "Last 7 Days", "Older"];
  const map: Record<string, ServerConversation[]> = {};
  for (const c of convs) {
    const label = getDateGroup(c.updatedAt);
    if (!map[label]) map[label] = [];
    map[label].push(c);
  }
  return order
    .filter((l) => map[l]?.length)
    .map((l) => ({ label: l, items: map[l] }));
}

function SidebarSkeleton() {
  return (
    <div className="space-y-1 px-2 pt-2">
      {[0.8, 0.6, 0.9, 0.7, 0.75].map((opacity, i) => (
        <div
          key={i}
          className="h-[52px] rounded-xl bg-white/4 animate-pulse"
          style={{ opacity }}
        />
      ))}
    </div>
  );
}

function RenameInput({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue: string;
  onConfirm: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onConfirm(value.trim() || initialValue);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onConfirm(value.trim() || initialValue)}
      className="w-full text-xs font-medium bg-background/60 border border-primary/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary/60"
      data-testid="input-rename-conversation"
      autoFocus
    />
  );
}

export function ChatSidebar({
  conversations,
  isLoading = false,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groups = groupConversations(filtered);

  return (
    <div className="flex flex-col h-full bg-card border-r border-white/5">
      {/* Header */}
      <div className="p-4 flex items-center h-[60px] border-b border-white/5 flex-shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-foreground">MedAI</span>
        </Link>
      </div>

      {/* New Chat Button */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onNewChat}
          data-testid="button-new-chat"
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/15 transition-colors group"
        >
          <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
          New Conversation
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-conversations"
            className="w-full pl-8 pr-3 py-2 text-xs bg-background/40 border border-white/6 rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-colors"
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <SidebarSkeleton />
        ) : (
          <div className="pb-2 space-y-4">
            <AnimatePresence>
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest mb-1 pt-2">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = item.id === activeId;
                      const isRenaming = item.id === renamingId;
                      return (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}
                          className="relative group/item"
                        >
                          <button
                            onClick={() => !isRenaming && onSelect(item.id)}
                            data-testid={`conversation-item-${item.id}`}
                            className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 ${
                              isActive
                                ? "bg-primary/12 border border-primary/20 text-foreground"
                                : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 pr-24">
                              <MessageSquare
                                className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                                  isActive ? "text-primary" : "text-muted-foreground/40"
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  {isRenaming ? (
                                    <RenameInput
                                      initialValue={item.title}
                                      onConfirm={(v) => {
                                        setRenamingId(null);
                                        if (v !== item.title) onRename(item.id, v);
                                      }}
                                      onCancel={() => setRenamingId(null)}
                                    />
                                  ) : (
                                    <>
                                      <span
                                        className="text-xs font-medium truncate flex-1 min-w-0 leading-[1.5]"
                                        title={item.title}
                                      >
                                        {item.title}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground/30 flex-shrink-0">
                                        {formatTime(item.updatedAt)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {!isRenaming && item.lastMessage && (
                                  <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">
                                    {item.lastMessage}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Item actions — always rendered so they work on touch & hover */}
                          {!isRenaming && (
                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {confirmDeleteId === item.id ? (
                                <div className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-black/80 px-2 py-1 shadow-xl">
                                  <span className="text-[10px] font-semibold text-rose-400 whitespace-nowrap">Delete?</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(null);
                                      onDelete(item.id);
                                    }}
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white bg-rose-500 hover:bg-rose-400 transition-colors"
                                    aria-label="Confirm delete"
                                    data-testid={`button-confirm-delete-${item.id}`}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Cancel delete"
                                    data-testid={`button-cancel-delete-${item.id}`}
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingId(item.id);
                                      setConfirmDeleteId(null);
                                    }}
                                    className="p-1.5 rounded-md text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
                                    aria-label={`Rename ${item.title}`}
                                    data-testid={`button-rename-${item.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingId("");
                                      setConfirmDeleteId(item.id);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-rose-400/90 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                                    aria-label={`Delete ${item.title}`}
                                    title="Delete conversation"
                                    data-testid={`button-delete-${item.id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {!isLoading && groups.length === 0 && (
              <p className="text-xs text-muted-foreground/40 text-center py-6 px-2">
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </p>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-white/5 flex-shrink-0 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to website
        </Link>
      </div>
    </div>
  );
}
