import { useId, useState } from "react";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSearch,
  FileText,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import {
  formatPageLabel,
  safeSourceHref,
  sourceTypeLabel,
  type SourceReference,
} from "../../lib/citations";

interface SourceReferencesPanelProps {
  sources: SourceReference[];
  basis?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}

const kindBadgeClass =
  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium";

/**
 * Chat-facing source list. Shared knowledge-base sources and the user's own
 * attachments are labelled separately; links are only rendered when the
 * footer (or the user's own message) supplied a safe URL.
 */
export function SourceReferencesPanel({
  sources,
  basis,
  compact,
  defaultOpen = true,
}: SourceReferencesPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const rawId = useId();
  const panelId = `sources-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasShared = sources.some((source) => source.kind === "shared");
  const hasAttachment = sources.some((source) => source.kind === "attachment");

  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`w-full flex items-center justify-between gap-2 rounded-xl text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          compact ? "px-2.5 py-2" : "px-3 py-2.5"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
          <span className="text-xs font-semibold text-foreground">Sources</span>
          <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/70">
            {sources.length}
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/40" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/40" />
        )}
      </button>

      {open && (
        <div id={panelId} className="space-y-2 px-2.5 pb-2.5">
          {sources.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5">
              <FileSearch className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                No evidence was found for this query. The AI response is based
                on general medical knowledge. This is informational and is not
                a diagnosis.
              </p>
            </div>
          ) : (
            <>
              {hasShared && hasAttachment && (
                <p className="px-0.5 text-[9px] leading-relaxed text-muted-foreground/40">
                  Shared sources come from MedAI's medical knowledge base. Your
                  attachments stay private to this conversation.
                </p>
              )}
              {sources.map((source) => (
                <SourceCard key={source.key} source={source} />
              ))}
            </>
          )}

          {basis && (
            <p className="px-0.5 pt-0.5 text-[9px] leading-relaxed text-muted-foreground/40">
              {basis}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: SourceReference }) {
  const isAttachment = source.kind === "attachment";
  const href = safeSourceHref(source.url);
  const pageLabel = formatPageLabel(source.pages);
  const Icon = isAttachment ? Paperclip : Building2;

  return (
    <div className="rounded-lg border border-white/5 bg-background/40 p-2.5">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
        <div className="min-w-0 flex-1">
          <span
            className={`${kindBadgeClass} ${
              isAttachment
                ? "border-violet-500/20 bg-violet-500/10 text-violet-300"
                : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
            }`}
          >
            {sourceTypeLabel(source.kind)}
          </span>

          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${
                isAttachment ? "Open attachment" : "Open shared source"
              } ${source.title}`}
              className="mt-1 inline-flex max-w-full items-start gap-1 rounded text-xs font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="break-words">{source.title}</span>
              <ExternalLink className="mt-0.5 w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <p className="mt-1 break-words text-xs font-medium text-foreground">
              {source.title}
            </p>
          )}

          {(source.journal ||
            source.publicationYear ||
            pageLabel ||
            source.pmcid) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted-foreground/60">
              {source.journal && (
                <span className="italic">{source.journal}</span>
              )}
              {source.publicationYear && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  {source.publicationYear}
                </span>
              )}
              {pageLabel && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-2.5 h-2.5" />
                  {pageLabel}
                </span>
              )}
              {source.pmcid && <span>PMCID {source.pmcid}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
