import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Stethoscope, 
  Clock, 
  Shield, 
  ActivitySquare, 
  Pill, 
  AlertTriangle 
} from "lucide-react";

const features = [
  {
    icon: Stethoscope,
    title: "Instant AI Diagnosis",
    description: "Describe your symptoms and get an immediate, evidence-based assessment of possible conditions."
  },
  {
    icon: Clock,
    title: "24/7 Availability",
    description: "Medical guidance doesn't sleep. Access intelligent triage and reassurance at any hour of the night."
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your health data is encrypted end-to-end and never used to train generalized models. HIPAA compliant."
  },
  {
    icon: ActivitySquare,
    title: "Symptom Analysis",
    description: "Advanced natural language processing connects your informal descriptions to precise medical terminology."
  },
  {
    icon: Pill,
    title: "Drug Interactions",
    description: "Instantly check complex medication lists for potential adverse reactions and contraindications."
  },
  {
    icon: AlertTriangle,
    title: "Emergency Triage",
    description: "Built-in safety protocols instantly detect red-flag symptoms and escalate to emergency services when needed."
  }
];

export function FeaturesSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <section className="py-24 bg-card relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
            Surgical precision, <br />
            <span className="text-muted-foreground font-normal">infinite patience.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            MedAI combines the vast knowledge of medical literature with the reassuring bedside manner of a dedicated clinician.
          </p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div key={index} variants={itemVariants}>
                <Card className="h-full bg-background border-border hover:border-primary/50 hover:shadow-[0_8px_30px_rgba(0,184,217,0.1)] transition-all duration-300 group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                      <Icon className="w-6 h-6 text-primary group-hover:text-primary-foreground" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base leading-relaxed text-muted-foreground">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
