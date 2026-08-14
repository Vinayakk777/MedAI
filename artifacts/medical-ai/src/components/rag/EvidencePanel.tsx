import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, ExternalLink, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Building2, Calendar, FileText,
} from "lucide-react";

type CitationEvidence = {
  chunkId: string;
  documentId: string;
  organization: string;
  guidelineName?: string;
  publicationDate?: string;
  evidenceText: string;
  confidence: "high" | "moderate" | "low";
  relevanceScore: number;
  section?: string;
};

type EvidenceGroup = {
  organization: string;
  citations: CitationEvidence[];
  totalRelevance: number;
};

type RagResult = {
  query: string;
  hasEvidence: boolean;
  groups: EvidenceGroup[];
  citations: CitationEvidence[];
  summary?: string;
  noEvidenceMessage?: string;
  latencyMs: number;
};

interface Props {
  query?: string;
  result?: RagResult;
  isLoading?: boolean;
  onClose?: () => void;
  compact?: boolean;
}

const confidenceConfig = {
  high:    { label: "High Confidence",  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  moderate: { label: "Moderate Confidence", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  low:     { label: "Low Confidence",   color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20" },
};

export function EvidencePanel({ query, result, isLoading, onClose, compact }: Props) {
  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-24 bg-white/5 rounded" />
          <div className="h-16 bg-white/5 rounded" />
          <div className="h-16 bg-white/5 rounded" />
        </div>
      </motion.div>
    );
  }

  if (!result) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm ${compact ? "p-3" : "p-4"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-cyan-400`} />
          <span className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>
            Medical Evidence
          </span>
          {result.hasEvidence && (
            <span className={`bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium rounded-md ${compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"}`}>
              {result.citations.length} source{result.citations.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-all">
            <Shield className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!result.hasEvidence ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-amber-400 flex-shrink-0 mt-0.5`} />
          <p className={`text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
            {result.noEvidenceMessage ?? "No evidence was found for this query. The AI response is based on general medical knowledge."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          {result.summary && (
            <p className={`text-muted-foreground/60 ${compact ? "text-[9px]" : "text-[10px]"}`}>
              {result.summary}
            </p>
          )}

          {/* Evidence groups by organization */}
          {result.groups.map((group) => (
            <EvidenceGroupCard key={group.organization} group={group} compact={compact} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function EvidenceGroupCard({ group, compact }: { group: EvidenceGroup; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const topCitation = group.citations[0];

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-muted-foreground/50 flex-shrink-0`} />
          <div className="min-w-0">
            <p className={`font-medium text-foreground truncate ${compact ? "text-[10px]" : "text-xs"}`}>
              {group.organization}
            </p>
            <p className={`text-muted-foreground/40 ${compact ? "text-[8px]" : "text-[9px]"}`}>
              {group.citations.length} passage{group.citations.length !== 1 ? "s" : ""} · Score: {Math.round(group.totalRelevance * 100)}%
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-muted-foreground/40 flex-shrink-0`} /> :
                     <ChevronDown className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-muted-foreground/40 flex-shrink-0`} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-2.5 pb-2.5 space-y-2">
              {group.citations.slice(0, compact ? 2 : 5).map((citation) => (
                <CitationCard key={citation.chunkId} citation={citation} compact={compact} />
              ))}
              {group.citations.length > (compact ? 2 : 5) && (
                <p className={`text-muted-foreground/30 ${compact ? "text-[8px]" : "text-[9px]"}`}>
                  +{group.citations.length - (compact ? 2 : 5)} more passages
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from "react";

function CitationCard({ citation, compact }: { citation: CitationEvidence; compact?: boolean }) {
  const conf = confidenceConfig[citation.confidence] ?? confidenceConfig.moderate;

  return (
    <div className="p-2 rounded-lg bg-background/40 border border-white/5 space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Confidence badge */}
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${conf.bg} ${conf.color} ${conf.border}`}>
          <Shield className="w-2.5 h-2.5" />
          {conf.label}
        </span>

        {/* Guideline name */}
        {citation.guidelineName && (
          <span className={`flex items-center gap-0.5 text-muted-foreground/50 ${compact ? "text-[8px]" : "text-[9px]"}`}>
            <FileText className="w-2.5 h-2.5" />
            {citation.guidelineName}
          </span>
        )}

        {/* Publication date */}
        {citation.publicationDate && (
          <span className={`flex items-center gap-0.5 text-muted-foreground/40 ${compact ? "text-[8px]" : "text-[9px]"}`}>
            <Calendar className="w-2.5 h-2.5" />
            {new Date(citation.publicationDate).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
          </span>
        )}

        {/* Relevance score */}
        <span className={`text-muted-foreground/40 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          Relevance: {Math.round(citation.relevanceScore * 100)}%
        </span>
      </div>

      {/* Evidence text */}
      <p className={`text-muted-foreground/70 leading-relaxed ${compact ? "text-[9px]" : "text-[10px]"}`}>
        {citation.evidenceText}
      </p>

      {/* Section */}
      {citation.section && (
        <p className={`text-muted-foreground/30 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          Section: {citation.section}
        </p>
      )}
    </div>
  );
}

export type { CitationEvidence, EvidenceGroup, RagResult };
