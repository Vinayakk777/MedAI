import { motion } from "framer-motion";
import { MessageSquare, Brain, ClipboardPlus } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Ask",
    description: "Describe your symptoms or health concerns in natural language, just as you would to a doctor.",
    icon: MessageSquare,
  },
  {
    number: "02",
    title: "Analyze",
    description: "MedAI processes your input against a vast, verified medical knowledge base to identify potential conditions.",
    icon: Brain,
  },
  {
    number: "03",
    title: "Act",
    description: "Receive clear, actionable guidance on next steps—whether it's self-care, scheduling a visit, or seeking urgent care.",
    icon: ClipboardPlus,
  }
];

export function HowItWorksSection() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
            How MedAI Works
          </h2>
          <p className="text-lg text-muted-foreground">
            A frictionless path from concern to clarity in three simple steps.
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-[2px] bg-border -translate-y-1/2 z-0" />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className="flex flex-col items-center text-center relative"
                >
                  <div className="w-20 h-20 rounded-full bg-card border-4 border-background flex items-center justify-center shadow-lg relative mb-6">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-md" />
                    <Icon className="w-8 h-8 text-primary relative z-10" />
                    <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-md">
                      {step.number}
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
