import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Activity, 
  User, 
  AlertTriangle, 
  PlusCircle, 
  MessageSquare, 
  PanelLeftClose, 
  PanelLeftOpen,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "user",
    content: "I've had a dull headache for the past two days, mostly around my forehead. It's not terrible, maybe a 4/10, but it won't go away."
  },
  {
    id: "2",
    role: "ai",
    content: "I understand you've been experiencing a persistent dull headache around your forehead for the past two days. \n\nGiven your description, this sounds characteristic of a tension-type headache, which is very common and often related to stress, dehydration, or eye strain.\n\n**To help me provide better guidance, could you tell me:**\n1. Are you experiencing any other symptoms like fever, neck stiffness, nausea, or changes in vision?\n2. Have you taken any over-the-counter pain medication, and did it help?\n3. How has your sleep and water intake been recently?"
  }
];

const HISTORY = [
  "Persistent headache",
  "Lower back pain after lifting",
  "Skin rash on arm",
  "Allergy medication timing"
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue
    };

    setMessages(prev => [...prev, newMsg]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "Thank you for that information. Based on what you've shared, this continues to align with a tension headache.\n\n**Recommended next steps:**\n- Ensure you are drinking adequate water (aim for 8 glasses a day).\n- Try taking a standard dose of acetaminophen (Tylenol) or ibuprofen (Advil) following package instructions.\n- Rest in a quiet, dimly lit room if possible.\n\n**When to see a doctor:**\nIf your headache worsens significantly, becomes sudden and severe, or if you develop new symptoms like a fever, stiff neck, or confusion, please seek immediate medical evaluation."
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 2000);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="border-r border-border bg-card flex flex-col flex-shrink-0"
          >
            <div className="p-4 h-16 flex items-center justify-between border-b border-border">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Activity className="w-5 h-5" />
                </div>
                <span className="font-bold text-lg tracking-tight">MedAI</span>
              </Link>
            </div>
            
            <div className="p-4">
              <Button className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-0">
                <PlusCircle className="w-4 h-4" />
                New Conversation
              </Button>
            </div>
            
            <ScrollArea className="flex-1 px-3">
              <div className="space-y-1 pb-4">
                <h4 className="px-2 text-xs font-medium text-muted-foreground mb-2 mt-4 uppercase tracking-wider">Recent</h4>
                {HISTORY.map((chat, i) => (
                  <button
                    key={i}
                    className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md transition-colors ${
                      i === 0 
                        ? "bg-secondary text-foreground font-medium" 
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="truncate text-left">{chat}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t border-border mt-auto">
              <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to Website
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative">
        
        {/* Emergency Banner */}
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center justify-center gap-2 text-destructive text-sm font-medium">
          <AlertTriangle className="w-4 h-4" />
          <span>For medical emergencies, call 911 or your local emergency services immediately.</span>
        </div>

        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <span className="font-medium text-foreground">Current Session</span>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                )}
                
                <div 
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-tr-sm" 
                      : "bg-card border border-border text-foreground rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {msg.content.split('\n').map((line, i) => {
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <strong key={i} className="block mt-4 mb-2">{line.replace(/\*\*/g, '')}</strong>;
                        }
                        if (line.startsWith('- ')) {
                          return <li key={i} className="ml-4">{line.substring(2)}</li>;
                        }
                        if (line.match(/^\d+\.\s/)) {
                          return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
                        }
                        return line ? <p key={i} className="mb-2">{line}</p> : <br key={i} />;
                      })}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-4 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4 flex items-center gap-1 shadow-sm">
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    className="w-2 h-2 bg-primary/50 rounded-full"
                  />
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 bg-primary/50 rounded-full"
                  />
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 bg-primary/50 rounded-full"
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 bg-background border-t border-border">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Describe your symptoms..."
                className="pr-12 h-14 bg-card border-border rounded-xl focus-visible:ring-primary shadow-sm text-base"
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!inputValue.trim() || isTyping}
                className="absolute right-2 h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-3">
              MedAI can make mistakes. Always verify important information with your doctor.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
