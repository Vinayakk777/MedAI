import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Scale, Shield, Users } from "lucide-react";

export default function AboutPage() {
  const team = [
    {
      name: "Dr. Sarah Chen, MD",
      role: "Chief Medical Officer",
      bio: "Former Stanford Chief Resident with 15+ years in internal medicine."
    },
    {
      name: "Marcus Reynolds",
      role: "Head of AI Engineering",
      bio: "Machine learning researcher previously at DeepMind Health."
    },
    {
      name: "Dr. James Wilson, MD, PhD",
      role: "VP of Clinical Safety",
      bio: "Specialist in AI ethics and patient safety protocols."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Mission Section */}
          <div className="max-w-3xl mx-auto text-center mb-24">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Democratizing medical intelligence.
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We believe everyone deserves instant access to world-class medical reasoning. MedAI was built to bridge the gap between human concern and professional care, providing a safe, intelligent first step for your health journey.
            </p>
          </div>

          {/* Core Values */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Safety First</h3>
              <p className="text-muted-foreground">Built with aggressive fail-safes that default to referring patients to human clinicians when uncertainty exists.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                <Scale className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Evidence Based</h3>
              <p className="text-muted-foreground">Trained strictly on peer-reviewed medical literature, clinical guidelines, and verified pharmacological data.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Augment, Don't Replace</h3>
              <p className="text-muted-foreground">Designed to prepare you for your doctor's visit, not to replace the essential human connection of healthcare.</p>
            </div>
          </div>

          {/* Team Section */}
          <div className="max-w-5xl mx-auto mb-24">
            <h2 className="text-3xl font-bold text-center mb-12">Clinical & Technical Leadership</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {team.map((member, i) => (
                <Card key={i} className="bg-card border-border">
                  <CardContent className="pt-6">
                    <div className="w-20 h-20 rounded-full bg-secondary mb-4 mx-auto overflow-hidden">
                      <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                        {member.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                    </div>
                    <div className="text-center">
                      <h4 className="font-semibold text-lg">{member.name}</h4>
                      <p className="text-primary text-sm font-medium mb-3">{member.role}</p>
                      <p className="text-sm text-muted-foreground">{member.bio}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Full Disclaimer */}
          <div className="max-w-4xl mx-auto bg-destructive/5 border border-destructive/20 rounded-2xl p-8">
            <div className="flex items-center gap-3 text-destructive mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-xl font-semibold">Medical Disclaimer</h3>
            </div>
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                The information provided by MedAI is for educational and informational purposes only and does not constitute medical advice.
              </p>
              <p>
                <strong>MedAI is not a doctor.</strong> The use of our application does not create a doctor-patient relationship. You should not rely on this information as a substitute for, nor does it replace, professional medical advice, diagnosis, or treatment.
              </p>
              <p>
                If you have any concerns or questions about your health, you should always consult with a physician or other healthcare professional. Do not disregard, avoid or delay obtaining medical or health related advice from your healthcare professional because of something you may have read on this site.
              </p>
              <p className="text-foreground font-semibold">
                If you think you may have a medical emergency, call your doctor, go to the nearest hospital emergency department, or call the emergency services immediately.
              </p>
            </div>
          </div>

        </div>
      </main>
      
      <Footer />
    </div>
  );
}
