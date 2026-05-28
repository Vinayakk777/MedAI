import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sun, Moon, Activity, LogOut, LayoutDashboard, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useUser, useClerk, Show } from "@clerk/react";

function UserAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const { user } = useUser();
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm";
  if (user?.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt={user.fullName ?? "User"}
        className={`${sz} rounded-full object-cover ring-2 ring-primary/30`}
      />
    );
  }
  const initials = user?.firstName?.[0]?.toUpperCase() ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U";
  return (
    <div className={`${sz} rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-semibold`}>
      {initials}
    </div>
  );
}

function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="button-user-menu"
        aria-label="User menu"
        className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/5 transition-colors"
      >
        <UserAvatar />
        <span className="hidden lg:block text-sm font-medium text-foreground max-w-[120px] truncate">
          {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0]}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-card border border-white/8 shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden z-[100]"
          >
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-sm font-semibold text-foreground truncate">
                {user?.fullName ?? "Account"}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
            </div>
            <div className="py-1">
              <Link
                href="/chat"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            </div>
            <div className="border-t border-white/5 py-1">
              <button
                onClick={() => signOut()}
                data-testid="button-sign-out"
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/8 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Dashboard", path: "/dashboard" },
    { name: "Chat", path: "/chat" },
    { name: "About", path: "/about" },
  ];

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-xl border-b border-white/10 dark:border-white/5"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <Activity className="w-6 h-6 relative z-10" />
              </div>
              <span className="font-bold text-xl tracking-tight text-foreground">
                MedAI
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <ul className="flex items-center gap-6">
              {navLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    href={link.path}
                    className={`text-sm font-medium transition-colors hover:text-primary ${
                      location === link.path
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3 border-l border-border pl-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <Show when="signed-in">
                <UserMenu />
              </Show>

              <Show when="signed-out">
                <Link href="/sign-in">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Sign In
                  </Button>
                </Link>
                <Link href="/chat">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(0,184,217,0.4)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,184,217,0.6)]">
                    Start Free
                  </Button>
                </Link>
              </Show>
            </div>
          </nav>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-3">
            <Show when="signed-in">
              <UserAvatar size="sm" />
            </Show>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md hover:bg-secondary text-foreground transition-colors"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl"
          >
            <div className="px-4 pt-4 pb-6 space-y-4">
              <ul className="space-y-2">
                {navLinks.map((link) => (
                  <li key={link.path}>
                    <Link
                      href={link.path}
                      onClick={() => setIsOpen(false)}
                      className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                        location === link.path
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="pt-2 space-y-2">
                <Show when="signed-out">
                  <Link href="/chat" onClick={() => setIsOpen(false)}>
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(0,184,217,0.4)]">
                      Start Free
                    </Button>
                  </Link>
                </Show>
                <Show when="signed-in">
                  <MobileSignOut />
                </Show>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

function MobileSignOut() {
  const { signOut } = useClerk();
  return (
    <button
      onClick={() => signOut()}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-base font-medium text-rose-400 hover:bg-rose-500/8 transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Sign out
    </button>
  );
}
