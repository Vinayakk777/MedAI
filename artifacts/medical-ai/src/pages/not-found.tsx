import { motion } from "framer-motion";
import { Link } from "wouter";
import { Activity, ArrowLeft, Search } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";

export default function NotFound() {
  return (
    <PageTransition className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
          className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8"
        >
          <Activity className="w-9 h-9 text-primary" />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <p className="text-[11px] font-semibold tracking-widest text-primary/60 uppercase mb-3">
            404 · Page Not Found
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
            This page doesn't exist
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-8 text-sm sm:text-base">
            The page you're looking for may have moved or never existed.
            Let's get you back to where you need to be.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Link href="/">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(0,184,217,0.3)]">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </button>
          </Link>
          <Link href="/chat">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/4 text-foreground text-sm font-medium hover:bg-white/8 transition-colors">
              <Search className="w-4 h-4" />
              Ask MedAI
            </button>
          </Link>
        </motion.div>
      </div>
    </PageTransition>
  );
}
