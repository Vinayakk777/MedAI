import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Save, Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

function nameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split("@")[0];
  const parts = local.split(/[._\-+]/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: capitalize(parts.slice(1).join(" ")),
    };
  }
  return { firstName: capitalize(local), lastName: "" };
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      const email = user.emailAddresses?.[0]?.emailAddress ?? "";
      const derived = nameFromEmail(email);
      setFirstName(user.firstName ?? derived.firstName);
      setLastName(user.lastName ?? derived.lastName);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, user]);

  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  const avatarInitials =
    [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() ||
    email[0]?.toUpperCase() ||
    "U";

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      await user.setProfileImage({ file });
    } catch {
      setError("Failed to upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 900);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 flex items-center justify-center z-[201] pointer-events-none px-4"
          >
            <div className="pointer-events-auto w-full max-w-md bg-card rounded-2xl border border-white/8 shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h2 className="text-base font-semibold text-foreground">Edit Profile</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-6 space-y-5">
                {/* Avatar upload */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="relative group rounded-full"
                    disabled={uploadingPhoto}
                    aria-label="Change profile photo"
                  >
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt=""
                        className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold">
                        {avatarInitials}
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingPhoto ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </button>
                  <p className="text-xs text-muted-foreground/60">
                    {uploadingPhoto ? "Uploading…" : "Click to change photo"}
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>

                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">First name</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-white/8 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Last name</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-white/8 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <div className="px-3 py-2 rounded-xl bg-background/40 border border-white/5 text-sm text-muted-foreground select-all">
                    {email || "—"}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || success || uploadingPhoto}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[110px]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving…
                    </>
                  ) : success ? (
                    "Saved ✓"
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
