/**
 * PubMed Live Search — On-Demand Article Ingestion
 *
 * When a user asks a medical question, this module:
 * 1. Searches PubMed Central for relevant open-access articles
 * 2. Fetches metadata + full text
 * 3. Ingests into the RAG knowledge base (with dedup)
 *
 * This grows the knowledge base organically with user queries.
 * Articles are fetched once and reused for future queries.
 */

import { db, medicalDocumentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { IngestionPipeline } from "../ingestion/pipeline";
import { createEmbedder } from "../embeddings/embedder";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PUBMED_PMC = "https://www.ncbi.nlm.nih.gov/pmc";
const MAX_ARTICLES_PER_QUERY = 5;
const REQUEST_DELAY_MS = 350; // NCBI rate limit

interface PubMedArticle {
  pmcid: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  content: string;
  sourceUrl: string;
}

// ─── Check if article already exists ───

async function articleExists(pmcid: string): Promise<boolean> {
  const checksum = `pmcid:${pmcid}`;
  const [existing] = await db
    .select({ id: medicalDocumentsTable.id })
    .from(medicalDocumentsTable)
    .where(eq(medicalDocumentsTable.checksum, checksum))
    .limit(1);
  return !!existing;
}

// ─── Search PubMed Central ───

async function searchPMC(query: string, limit: number): Promise<string[]> {
  const url = `${NCBI_BASE}/esearch.fcgi?db=pmc&term=${encodeURIComponent(query + " free full text[filter]")}&retmax=${limit}&retmode=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json() as any;
  return data?.esearchresult?.idlist || [];
}

// ─── Fetch metadata ───

async function fetchSummary(pmcid: string): Promise<Omit<PubMedArticle, "content" | "sourceUrl"> | null> {
  try {
    const url = `${NCBI_BASE}/esummary.fcgi?db=pmc&id=${pmcid}&retmode=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const doc = data?.result?.[pmcid];
    if (!doc) return null;
    return {
      pmcid,
      title: doc.title || "Untitled",
      authors: (doc.authors || []).map((a: any) => a.name).filter(Boolean),
      journal: doc.fulljournalname || doc.source || "",
      pubDate: doc.pubdate || "",
    };
  } catch {
    return null;
  }
}

// ─── Fetch full text ───

async function fetchFullText(pmcid: string): Promise<string> {
  try {
    const url = `${NCBI_BASE}/efetch.fcgi?db=pmc&id=${pmcid}&rettype=xml&retmode=xml`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const xml = await res.text();
    return extractText(xml);
  } catch {
    return "";
  }
}

function extractText(xml: string): string {
  let text = xml
    .replace(/<xref[^>]*>.*?<\/xref>/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const bodyStart = text.indexOf("Introduction");
  const refStart = text.indexOf("References");

  if (bodyStart !== -1 && refStart !== -1 && refStart > bodyStart) {
    text = text.substring(bodyStart, refStart);
  } else if (bodyStart !== -1) {
    text = text.substring(bodyStart, bodyStart + 50000);
  } else {
    text = text.substring(0, 50000);
  }

  return text;
}

// ─── Ingest a single article ───

async function ingestArticle(article: PubMedArticle): Promise<boolean> {
  // Dedup check
  if (await articleExists(article.pmcid)) return false;

  const pipeline = new IngestionPipeline(createEmbedder());
  const result = await pipeline.ingestDocument({
    title: article.title,
    organization: "PubMed Central",
    content: article.content || article.title,
    documentType: "medical_article",
    publicationDate: article.pubDate ? new Date(article.pubDate) : undefined,
    author: article.authors.join(", "),
    tags: [article.journal, "pubmed", "live-search"],
    url: article.sourceUrl,
    metadata: {
      pmcid: article.pmcid,
      journal: article.journal,
      authors: article.authors,
      sourceUrl: article.sourceUrl,
      ingestedVia: "live-search",
    },
    chunkerName: "recursive",
  });

  return result.success;
}

// ─── Main: Live search + ingest ───

export async function liveSearchAndIngest(query: string): Promise<{
  articlesFound: number;
  articlesIngested: number;
  articlesSkipped: number;
  pmcids: string[];
}> {
  const stats = { articlesFound: 0, articlesIngested: 0, articlesSkipped: 0, pmcids: [] as string[] };

  // Search PubMed
  const pmcids = await searchPMC(query, MAX_ARTICLES_PER_QUERY);
  stats.articlesFound = pmcids.length;

  if (pmcids.length === 0) return stats;

  let ingested = 0;
  let skipped = 0;

  for (let i = 0; i < pmcids.length; i++) {
    const pmcid = pmcids[i];
    stats.pmcids.push(pmcid);

    // Skip if already exists
    if (await articleExists(pmcid)) {
      skipped++;
      continue;
    }

    // Fetch metadata
    const meta = await fetchSummary(pmcid);
    if (!meta) continue;

    // Fetch full text
    const fullText = await fetchFullText(pmcid);

    const article: PubMedArticle = {
      pmcid,
      title: meta.title,
      authors: meta.authors,
      journal: meta.journal,
      pubDate: meta.pubDate,
      content: fullText || meta.title,
      sourceUrl: `${PUBMED_PMC}/articles/PMC${pmcid}/`,
    };

    // Ingest
    const ok = await ingestArticle(article);
    if (ok) ingested++;
    else skipped++;

    // Rate limit
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  stats.articlesIngested = ingested;
  stats.articlesSkipped = skipped;

  console.log(`[pubmed-live] query="${query.slice(0, 60)}" found=${stats.articlesFound} ingested=${stats.articlesIngested} skipped=${stats.articlesSkipped}`);

  return stats;
}
