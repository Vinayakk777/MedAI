import { motion } from "framer-motion";
import { useState } from "react";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Dr. Sarah Chen",
    role: "Cardiologist, Stanford Medical Center",
    avatar: "SC",
    avatarColor: "from-cyan-500 to-teal-600",
    rating: 5,
    quote:
      "I recommend MedAI to patients between appointments. The symptom documentation it generates is remarkably precise — patients arrive at consultations with better self-awareness and more useful data.",
    tag: "Physician",
    tagColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    name: "Marcus Reyes",
    role: "Patient — Type 2 Diabetes Management",
    avatar: "MR",
    avatarColor: "from-violet-500 to-purple-600",
    rating: 5,
    quote:
      "Managing multiple medications used to feel overwhelming. MedAI flagged a dangerous interaction my pharmacist missed. I'm not exaggerating when I say it may have saved my life.",
    tag: "Patient",
    tagColor: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
  {
    name: "Emily Hartman",
    role: "Head of Benefits, Luminary Group (4,200 employees)",
    avatar: "EH",
    avatarColor: "from-emerald-500 to-green-600",
    rating: 5,
    quote:
      "We deployed MedAI as part of our employee wellness package. ER visits dropped 18% in the first quarter. The ROI was immediate. It's the most impactful benefits investment we've made.",
    tag: "Enterprise",
    tagColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    name: "James Okafor",
    role: "Father of three, Austin TX",
    avatar: "JO",
    avatarColor: "from-amber-500 to-orange-600",
    rating: 5,
    quote:
      "At 2am when my son had a fever of 104°F, MedAI walked me through exactly what to do and when to go to the ER. No panic. Just clear, calm guidance. That's priceless.",
    tag: "Parent",
    tagColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    name: "Dr. Priya Nair",
    role: "Emergency Medicine Physician, UCSF",
    avatar: "PN",
    avatarColor: "from-rose-500 to-pink-600",
    rating: 5,
    quote:
      "The triage logic is clinically sound. Patients who used MedAI before coming in had already self-selected appropriately — fewer non-urgent visits, faster care for the ones who needed it.",
    tag: "Physician",
    tagColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  },
  {
    name: "Natalie Brooks",
    role: "Registered Nurse, Remote Health Clinic",
    avatar: "NB",
    avatarColor: "from-sky-500 to-blue-600",
    rating: 5,
    quote:
      "Working in a rural clinic, access to specialist knowledge is limited. MedAI fills that gap brilliantly — it's like having a consult available 24/7 without the wait or the cost.",
    tag: "Clinician",
    tagColor: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section className="py-28 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(6,182,212,0.05),transparent)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wider uppercase mb-6">
            Testimonials
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5 text-foreground leading-tight">
            Trusted by patients{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
              and clinicians
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Real stories from people who've made MedAI part of their healthcare
            routine.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((testimonial, index) => {
            const isHovered = hovered === index;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{
                  duration: 0.55,
                  delay: (index % 3) * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                data-testid={`testimonial-card-${index}`}
                className="group relative"
              >
                <div
                  className={`absolute -inset-px rounded-2xl transition-all duration-500 ${
                    isHovered ? "opacity-100" : "opacity-0"
                  }`}
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(20,184,166,0.1) 50%, transparent 100%)",
                  }}
                />

                <div
                  className={`relative h-full rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-7 flex flex-col transition-all duration-500 ${
                    isHovered ? "border-white/10" : ""
                  }`}
                  style={{
                    boxShadow: isHovered
                      ? "0 0 40px rgba(6,182,212,0.08), 0 20px 40px rgba(0,0,0,0.2)"
                      : "none",
                  }}
                >
                  <div className="flex items-start justify-between mb-5">
                    <Quote
                      className={`w-8 h-8 transition-colors duration-300 ${
                        isHovered ? "text-primary/60" : "text-muted-foreground/20"
                      }`}
                    />
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${testimonial.tagColor}`}
                    >
                      {testimonial.tag}
                    </span>
                  </div>

                  <StarRating count={testimonial.rating} />

                  <blockquote className="mt-4 mb-6 flex-grow text-sm text-muted-foreground leading-relaxed">
                    "{testimonial.quote}"
                  </blockquote>

                  <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${testimonial.avatarColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                    >
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {testimonial.name}
                      </div>
                      <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                        {testimonial.role}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
