import { motion } from "framer-motion";
import { HeartPulse } from "lucide-react";

export function TrustSection() {
  const stats = [
    { value: "50M+", label: "Queries Answered" },
    { value: "99.9%", label: "Uptime Reliability" },
    { value: "< 2s", label: "Response Time" },
    { value: "HIPAA", label: "Certified Secure" },
  ];

  return (
    <section className="py-24 bg-card border-t border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex flex-col items-center text-center space-y-2"
            >
              <div className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto bg-background rounded-2xl border border-border p-8 flex flex-col md:flex-row items-center gap-6"
        >
          <div className="flex-shrink-0 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <HeartPulse className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-foreground mb-2">Important Medical Disclaimer</h4>
            <p className="text-muted-foreground text-sm leading-relaxed">
              MedAI is an advanced informational tool designed to support, not replace, the relationship that exists between a patient and their physician. It does not provide medical diagnoses or prescribe treatment. In a medical emergency, always call 911 or your local emergency services immediately.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
