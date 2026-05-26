import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, ShieldCheck, Lock, AlertCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 pb-16 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-background pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-primary)_0%,transparent_50%)] opacity-20 dark:opacity-10 mix-blend-screen" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--chart-3))_0%,transparent_40%)] opacity-20 dark:opacity-10 mix-blend-screen" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          {/* Text Content */}
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              MedAI Intelligence v2.0 Live
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1] mb-6"
            >
              The intelligent <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-chart-3">
                front door
              </span>{" "}
              to healthcare.
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed"
            >
              Instant, trustworthy health guidance 24/7. Cut through the noise of self-diagnosis with calm, authoritative precision. Private, fast, and reassuringly competent.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 mb-10"
            >
              <Link href="/chat">
                <Button size="lg" className="w-full sm:w-auto text-base h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(0,184,217,0.3)] hover:shadow-[0_0_40px_rgba(0,184,217,0.5)] transition-all duration-300 group rounded-xl">
                  Start a Conversation
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-14 px-8 rounded-xl bg-background/50 backdrop-blur-sm border-border hover:bg-secondary">
                See How It Works
              </Button>
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <span>256-bit Encryption</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary" />
                <span>FDA Disclaimer</span>
              </div>
            </motion.div>
          </div>

          {/* Visual Area - Floating Orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
            className="relative lg:h-[600px] flex items-center justify-center"
          >
            <div className="relative w-[300px] h-[300px] sm:w-[400px] sm:h-[400px]">
              {/* Outer Glow */}
              <motion.div 
                animate={{ 
                  scale: [1, 1.05, 1],
                  opacity: [0.5, 0.7, 0.5]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-primary/30 rounded-full blur-[100px]"
              />
              
              {/* Middle Layer */}
              <motion.div 
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.02, 1]
                }}
                transition={{ 
                  rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                  scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                }}
                className="absolute inset-8 rounded-full border border-primary/40 bg-gradient-to-tr from-primary/20 to-transparent backdrop-blur-3xl shadow-[inset_0_0_50px_rgba(0,184,217,0.2)] flex items-center justify-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,184,217,0.4),transparent)]" />
              </motion.div>
              
              {/* Core Orb */}
              <motion.div 
                animate={{ 
                  scale: [1, 0.95, 1],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-20 rounded-full bg-gradient-to-br from-primary to-chart-3 shadow-[0_0_50px_rgba(0,184,217,0.8)] flex items-center justify-center overflow-hidden"
              >
                {/* Inner texture */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                <Activity className="w-16 h-16 text-white relative z-10" />
              </motion.div>

              {/* Orbital particles */}
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ 
                    duration: 8 + i * 2, 
                    repeat: Infinity, 
                    ease: "linear",
                    delay: i * 0.5
                  }}
                  className="absolute inset-0 origin-center"
                >
                  <div className={`absolute top-0 left-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(0,184,217,1)] -translate-x-1/2 -translate-y-1/2`} />
                </motion.div>
              ))}
            </div>
          </motion.div>
          
        </div>
      </div>
    </section>
  );
}
