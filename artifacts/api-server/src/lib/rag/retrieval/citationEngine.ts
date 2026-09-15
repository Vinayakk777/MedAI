import { db, medicalDocumentsTable, knowledgeSourcesTable, citationRecordsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { CitationEvidence, CitationGroup, ReRankedResult } from "../types";
import { RagQuery } from "../types";

/**
 * Citation Engine with Chunk-Level Provenance
 *
 * Builds structured citations from reranked results. Each citation includes:
 * - Source document metadata (organization, title, publication date)
 * - Chunk-level provenance (section, heading, position in document)
 * - Confidence score based on rerank score + document recency
 * - Evidence text snippet for LLM context
 *
 * The engine groups citations by organization for structured evidence
 * presentation, and persists citations to the database for observability.
 */
export class CitationEngine {
  async buildCitations(
    results: ReRankedResult[],
    query: RagQuery,
  ): Promise<{ evidenceGroups: CitationGroup[]; citations: CitationEvidence[] }> {
    const documentIds = [...new Set(results.map((r) => r.documentId))];

    // Fetch document metadata for citations (efficient WHERE IN query)
    const docs = documentIds.length > 0
      ? await db
          .select({
            id: medicalDocumentsTable.id,
            organization: medicalDocumentsTable.organization,
            title: medicalDocumentsTable.title,
            publicationDate: medicalDocumentsTable.publicationDate,
            version: medicalDocumentsTable.version,
            sourceId: medicalDocumentsTable.sourceId,
            category: medicalDocumentsTable.category,
            author: medicalDocumentsTable.author,
            url: medicalDocumentsTable.url,
            metadata: medicalDocumentsTable.metadata,
          })
          .from(medicalDocumentsTable)
          .where(inArray(medicalDocumentsTable.id, documentIds))
      : [];

    const docMap = new Map(docs.map((d) => [d.id, d]));

    // Build citations from results with chunk-level provenance
    const citations: CitationEvidence[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      const doc = docMap.get(result.documentId);
      if (!doc) continue;

      const dedupKey = `${result.chunkId}-${doc.organization}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const confidence = this.calculateConfidence(result.reRankScore, doc);

      // Enrich citation with chunk-level metadata
      const chunkPosition = (result.metadata?.chunkPosition as number) ?? 0;
      const totalChunks = (result.metadata?.totalChunks as number) ?? 1;
      const positionContext = totalChunks > 1
        ? ` [chunk ${Math.round(chunkPosition * totalChunks) + 1}/${totalChunks}]`
        : "";

      // Extract journal and pmcid from metadata JSONB
      const docMeta = (doc.metadata ?? {}) as Record<string, unknown>;

      citations.push({
        chunkId: result.chunkId,
        documentId: result.documentId,
        sourceId: result.sourceId,
        organization: doc.organization,
        guidelineName: `${doc.title ?? "Untitled"}${positionContext}`,
        publicationDate: doc.publicationDate ?? undefined,
        evidenceText: result.content.slice(0, 500),
        confidence,
        relevanceScore: result.reRankScore,
        section: result.section ?? (result.heading ?? undefined),
        author: doc.author ?? undefined,
        journal: (docMeta.journal as string) ?? undefined,
        pmcid: (docMeta.pmcid as string) ?? undefined,
        sourceUrl: doc.url ?? (docMeta.sourceUrl as string) ?? undefined,
      });
    }

    // Group by organization
    const groups = this.groupByOrganization(citations);

    return { evidenceGroups: groups, citations };
  }

  private calculateConfidence(
    score: number,
    doc: { publicationDate?: Date | null; version?: string | null },
  ): "high" | "moderate" | "low" {
    if (score >= 0.8 && doc.publicationDate) {
      const yearsSincePub = (Date.now() - new Date(doc.publicationDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
      if (yearsSincePub <= 3) return "high";
      if (yearsSincePub <= 7) return "moderate";
    }
    if (score >= 0.6) return "moderate";
    return "low";
  }

  private groupByOrganization(citations: CitationEvidence[]): CitationGroup[] {
    const groupMap = new Map<string, CitationEvidence[]>();
    for (const c of citations) {
      const existing = groupMap.get(c.organization) ?? [];
      existing.push(c);
      groupMap.set(c.organization, existing);
    }

    return Array.from(groupMap.entries())
      .map(([organization, items]) => ({
        organization,
        citations: items.sort((a, b) => b.relevanceScore - a.relevanceScore),
        totalRelevance: items.reduce((sum, c) => sum + c.relevanceScore, 0),
      }))
      .sort((a, b) => b.totalRelevance - a.totalRelevance);
  }

  async persistCitations(
    citations: CitationEvidence[],
    params: {
      retrievalLogId?: string;
      userId: string;
      conversationId?: string;
      pipelineStage?: string;
    },
  ): Promise<void> {
    if (citations.length === 0) return;

    const values = citations.map((c) => ({
      retrievalLogId: params.retrievalLogId ?? null,
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      chunkId: c.chunkId,
      documentId: c.documentId,
      sourceId: c.sourceId ?? null,
      organization: c.organization,
      guidelineName: c.guidelineName ?? null,
      publicationDate: c.publicationDate ?? null,
      evidenceText: c.evidenceText,
      confidence: c.confidence,
      relevanceScore: c.relevanceScore,
      pipelineStage: params.pipelineStage ?? null,
    }));

    try {
      await db.insert(citationRecordsTable).values(values);
    } catch {
      // Non-critical, don't fail the request
    }
  }

  formatNoEvidenceMessage(): string {
    return "No high-confidence medical evidence was found for this specific scenario. " +
      "The following response is based on general medical knowledge and should not replace " +
      "professional medical advice. Consult a healthcare provider for personalized guidance.";
  }
}
