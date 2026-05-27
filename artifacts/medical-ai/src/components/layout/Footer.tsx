import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Activity,
  Linkedin,
  Twitter,
  Github,
  Mail,
  Shield,
  ArrowRight,
} from "lucide-react";

const footerLinks = {
  Product: [
    { label: "Symptom Checker", href: "/chat" },
    { label: "Medication Guide", href: "/chat" },
    { label: "Health Reports", href: "/chat" },
    { label: "Emergency Guidance", href: "/chat" },
    { label: "Health Tracking", href: "/chat" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Careers", href: "#" },
    { label: "Press Kit", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "HIPAA Compliance", href: "#" },
    { label: "Cookie Policy", href: "#" },
    { label: "Medical Disclaimer", href: "#" },
  ],
};

const socialLinks = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
];

const certBadges = [
  "HIPAA Compliant",
  "SOC 2 Type II",
  "256-bit Encrypted",
  "Zero Data Retention",
];

export function Footer() {
  return (
    <footer className="relative bg-card border-t border-white/5 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_100%,rgba(6,182,212,0.04),transparent)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="py-16 border-b border-white/5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-3">
                Stay ahead of your health.
              </h3>
              <p className="text-muted-foreground text-sm max-w-md">
                Get weekly insights on AI in healthcare, product updates, and evidence-based wellness tips — straight to your inbox.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="relative flex-grow">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="Enter your email address"
                  data-testid="input-newsletter-email"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>
              <button
                data-testid="button-newsletter-subscribe"
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                Subscribe
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="py-16 grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 space-y-6">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary border border-primary/20 group-hover:bg-primary/20 transition-colors">
                <Activity className="w-5 h-5" />
              </div>
              <span className="font-bold text-xl tracking-tight text-foreground">
                MedAI
              </span>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The intelligent front door to healthcare. Trusted by 2.4M patients and recommended by leading clinicians.
            </p>

            <div className="flex items-center gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    data-testid={`link-social-${social.label.toLowerCase()}`}
                    className="w-9 h-9 rounded-xl bg-background border border-white/8 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all duration-200"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {certBadges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/70 border border-white/8 rounded-lg px-2.5 py-1"
                >
                  <Shield className="w-2.5 h-2.5 text-primary/60" />
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-5">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} MedAI Technologies, Inc. All rights
            reserved.
          </p>
          <p className="text-xs text-muted-foreground/40 max-w-lg text-center md:text-right leading-relaxed">
            MedAI provides educational health information only. It is not a substitute for professional medical advice, diagnosis, or treatment.
          </p>
        </div>
      </div>
    </footer>
  );
}
