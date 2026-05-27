import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Activity,
  PlusCircle,
  MessageSquare,
  ArrowLeft,
  Trash2,
  Settings,
  Search,
} from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type ConversationItem = {
  id: string;
  title: string;
  preview: string;
  time: string;
};

const CONVERSATION_GROUPS: { label: string; items: ConversationItem[] }[] = [
  {
    label: "Today",
    items: [
      { id: "1", title: "Persistent headache", preview: "Tension-type headache assessment...", time: "2:34 PM" },
      { id: "2", title: "Lower back pain", preview: "After lifting injury guidance...", time: "11:08 AM" },
    ],
  },
  {
    label: "Yesterday",
    items: [
      { id: "3", title: "Skin rash on forearm", preview: "Contact dermatitis evaluation...", time: "6:52 PM" },
      { id: "4", title: "Vitamin D deficiency", preview: "Supplement dosage recommendations...", time: "3:15 PM" },
    ],
  },
  {
    label: "Last 7 Days",
    items: [
      { id: "5", title: "Allergy medication timing", preview: "Cetirizine vs loratadine...", time: "Mon" },
      { id: "6", title: "Sleep disorder symptoms", preview: "Insomnia pattern analysis...", time: "Sun" },
      { id: "7", title: "Medication interaction check", preview: "Lisinopril + ibuprofen...", time: "Sat" },
    ],
  },
];

interface ChatSidebarProps {
  activeId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({ activeId = "1", onSelect, onNewChat }: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = CONVERSATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.preview.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-card border-r border-white/5">
      {/* Header */}
      <div className="p-4 flex items-center justify-between h-[60px] border-b border-white/5 flex-shrink-0">
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
        <div className="pb-2 space-y-4">
          <AnimatePresence>
            {filtered.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest mb-1 pt-2">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.id === activeId;
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative group/item"
                        onMouseEnter={() => setHoveredId(item.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <button
                          onClick={() => onSelect(item.id)}
                          data-testid={`conversation-item-${item.id}`}
                          className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 ${
                            isActive
                              ? "bg-primary/12 border border-primary/20 text-foreground"
                              : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/40"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-medium truncate">{item.title}</span>
                                <span className="text-[10px] text-muted-foreground/30 flex-shrink-0">{item.time}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">{item.preview}</p>
                            </div>
                          </div>
                        </button>

                        {/* Hover delete */}
                        <AnimatePresence>
                          {hoveredId === item.id && !isActive && (
                            <motion.button
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-6">
              No conversations found
            </p>
          )}
        </div>
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
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all">
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </div>
  );
}
