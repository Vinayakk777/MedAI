import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessage, type Message } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { EmptyState } from "@/components/chat/EmptyState";
import { MessageSkeleton } from "@/components/chat/MessageSkeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const AI_RESPONSES: string[] = [
  `Based on your description, this is consistent with a **tension-type headache** — the most common headache type, often triggered by stress, dehydration, or prolonged screen time.

**Immediate recommendations:**
- Drink 2–3 glasses of water over the next hour
- Take **acetaminophen 500–1000mg** or **ibuprofen 400mg** with food
- Rest in a quiet, dimly lit environment for 20–30 minutes

**Monitor for red flags:**
- Sudden, severe "thunderclap" onset
- Fever above 38.5°C (101.3°F) with neck stiffness
- Visual disturbances or confusion
- Headache that wakes you from sleep

> If symptoms persist beyond 72 hours or worsen significantly, please consult your physician.`,

  `I can help you check that interaction. Based on the medications you've mentioned:

**Potential interaction identified:**

**Ibuprofen + Lisinopril** — *Moderate concern*
- NSAIDs like ibuprofen can reduce the antihypertensive effect of ACE inhibitors
- May increase risk of acute kidney injury with long-term combined use

**Safer alternative:**
Consider **acetaminophen (Tylenol)** for pain relief — it does not share this interaction profile.

**What I recommend:**
1. Switch to acetaminophen for occasional pain management
2. Mention this to your prescribing physician at your next visit
3. Avoid regular NSAID use while on lisinopril

> This information is educational. Do not change your medications without consulting your doctor.`,

  `Thank you for sharing that. Let me walk you through what this could mean.

**Most likely possibilities** (based on your description):

1. **Contact dermatitis** — reaction to soap, detergent, or fabric
2. **Eczema (atopic dermatitis)** — especially if you have a history of allergies
3. **Tinea (ringworm)** — fungal infection, common and easily treated

**Key questions to help narrow this down:**
- Is it spreading or staying localized?
- Is it itchy, painful, or neither?
- Have you changed any products recently (soap, laundry detergent, lotion)?

**For now:**
- Avoid scratching — it can introduce bacteria
- Apply a fragrance-free moisturizer
- Consider 1% hydrocortisone cream for itch relief (available OTC)

> If the rash spreads, develops blisters, or is accompanied by fever, seek in-person evaluation promptly.`,

  `That's a great question about vitamin supplementation. Here's what the evidence says:

**Vitamin D Deficiency — Signs & Symptoms:**
- Fatigue and low energy
- Bone or muscle aches
- Frequent infections (vitamin D supports immune function)
- Low mood or seasonal depression

**Testing:**
A simple blood test (25-hydroxyvitamin D) confirms deficiency. Optimal range is typically **40–60 ng/mL**.

**General supplementation guidance:**
- Mild deficiency: **1,000–2,000 IU daily**
- Moderate deficiency: **2,000–4,000 IU daily** (physician-guided)
- Take with a meal containing fat for best absorption
- Vitamin D3 (cholecalciferol) is preferred over D2

**Food sources:**
Fatty fish (salmon, mackerel), egg yolks, fortified dairy, and sun exposure (15–20 min/day).

> Ask your doctor to run a baseline 25(OH)D level before starting supplementation.`,

  `I understand you're concerned about when to seek care. Here's a framework that clinicians use:

**See a doctor within 24 hours if you have:**
- High fever (>39°C / 102°F) not responding to medication
- Severe, worsening or unusual pain
- Symptoms that are rapidly progressing

**Go to urgent care today if you notice:**
- Shortness of breath with exertion
- Signs of infection (redness, warmth, swelling, discharge)
- Uncontrolled vomiting or inability to keep fluids down

**Call 911 or go to the ER immediately for:**
- Chest pain or pressure
- Sudden severe headache
- Facial drooping, arm weakness, or speech difficulty
- Difficulty breathing at rest
- Signs of severe allergic reaction (throat swelling, hives with breathing changes)

**You can monitor at home if:**
- Symptoms are mild and improving
- No red flag symptoms are present
- You are able to stay hydrated and rest

> When in doubt, trust your instincts — it's always better to be seen and reassured than to wait on something serious.`
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: "seed-1",
    role: "user",
    content: "I've had a dull headache for the past two days, mostly around my forehead. It's not terrible, maybe a 4/10, but it won't go away.",
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
  },
  {
    id: "seed-2",
    role: "ai",
    content: AI_RESPONSES[0],
    timestamp: new Date(Date.now() - 11 * 60 * 1000),
  },
];

let responseIndex = 1;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConvId, setActiveConvId] = useState("1");
  const [isNewChat, setIsNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsNewChat(false);
    setIsTyping(true);

    const delay = 1400 + Math.random() * 1200;
    setTimeout(() => {
      const aiContent = AI_RESPONSES[responseIndex % AI_RESPONSES.length];
      responseIndex++;
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: aiContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, delay);
  }, [isTyping]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setIsNewChat(true);
    setInput("");
    setIsTyping(false);
    setActiveConvId("");
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
    setIsNewChat(false);
    setIsLoading(true);
    setTimeout(() => {
      setMessages(INITIAL_MESSAGES);
      setIsLoading(false);
    }, 700);
  }, []);

  const isEmpty = messages.length === 0 && !isTyping;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex-shrink-0 overflow-hidden"
          >
            <ChatSidebar
              activeId={activeConvId}
              onSelect={handleSelectConversation}
              onNewChat={handleNewChat}
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
            For emergencies, call <strong className="text-rose-400">911</strong> immediately. MedAI is not a substitute for emergency care.
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
                {isNewChat || isEmpty ? "New Conversation" : "Persistent headache"}
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
          {isLoading ? (
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

              <AnimatePresence>
                {isTyping && <TypingIndicator />}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-md border-t border-white/5">
          {!isEmpty && !isLoading && (
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
