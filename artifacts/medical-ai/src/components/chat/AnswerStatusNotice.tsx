import { AlertTriangle, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import type { AnswerKind } from "../../lib/answerState";

interface NoticeConfig {
  icon: LucideIcon;
  label: string;
  description: string;
  container: string;
  iconClass: string;
  titleClass: string;
}

const NOTICES: Partial<Record<AnswerKind, NoticeConfig>> = {
  emergency: {
    icon: AlertTriangle,
    label: "Emergency guidance",
    description:
      "This is urgent safety guidance, not a diagnosis. If symptoms are severe, call your local emergency number now.",
    container: "border-rose-500/25 bg-rose-500/10",
    iconClass: "text-rose-400",
    titleClass: "text-rose-300",
  },
  safety_fallback: {
    icon: ShieldAlert,
    label: "Safety response",
    description:
      "MedAI could not safely validate a full answer. Please consult a qualified healthcare professional.",
    container: "border-amber-500/25 bg-amber-500/10",
    iconClass: "text-amber-400",
    titleClass: "text-amber-300",
  },
  insufficient: {
    icon: Info,
    label: "More information needed",
    description:
      "MedAI needs more detail before it can give safe guidance.",
    container: "border-cyan-500/25 bg-cyan-500/10",
    iconClass: "text-cyan-400",
    titleClass: "text-cyan-300",
  },
};

/**
 * Additive banner above an assistant message. The message body itself is
 * never rewritten, so the existing safety wording remains intact.
 */
export function AnswerStatusNotice({ kind }: { kind: AnswerKind }) {
  const notice = NOTICES[kind];
  if (!notice) return null;

  const Icon = notice.icon;

  return (
    <div
      role="status"
      className={`mb-2.5 flex items-start gap-2 rounded-lg border px-2.5 py-2 ${notice.container}`}
    >
      <Icon
        className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 ${notice.iconClass}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold ${notice.titleClass}`}>
          {notice.label}
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {notice.description}
        </p>
      </div>
    </div>
  );
}
