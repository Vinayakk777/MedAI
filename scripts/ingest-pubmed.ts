/**
 * PubMed Central RAG Ingestion Script
 *
 * Pulls free full-text medical articles from PubMed Central
 * and ingests them into the MedAI RAG knowledge base.
 *
 * Usage:
 *   npx tsx scripts/ingest-pubmed.ts "cardiovascular guidelines"
 *   npx tsx scripts/ingest-pubmed.ts "diabetes management" --limit 20
 *
 * Environment:
 *   API_URL      Backend API URL (default: http://localhost:3000)
 *   ADMIN_TOKEN  Admin auth token (if auth is configured)
 */

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PUBMED_PMC = "https://www.ncbi.nlm.nih.gov/pmc";
const API_URL = process.env.API_URL || "http://localhost:3000";

interface Article {
  pmcid: string;
  title: string;
  content: string;
  authors: string[];
  journal: string;
  pubDate: string;
}

// ─── Step 1: Search PubMed Central ───

async function searchPMC(query: string, limit: number): Promise<string[]> {
  console.log(`\n🔍 Searching: "${query}"`);

  const url = `${NCBI_BASE}/esearch.fcgi?db=pmc&term=${encodeURIComponent(query + " free full text[filter]")}&retmax=${limit}&retmode=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`PMC search failed: ${res.status}`);

  const data = await res.json();
  const ids: string[] = data?.esearchresult?.idlist || [];
  console.log(`   Found ${ids.length} articles`);
  return ids;
}

// ─── Step 2: Fetch article metadata ───

async function fetchSummary(pmcid: string): Promise<{ title: string; authors: string[]; journal: string; pubDate: string } | null> {
  try {
    const url = `${NCBI_BASE}/esummary.fcgi?db=pmc&id=${pmcid}&retmode=json`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const doc = data?.result?.[pmcid];
    if (!doc) return null;

    return {
      title: doc.title || "Untitled",
      authors: (doc.authors || []).map((a: any) => a.name).filter(Boolean),
      journal: doc.fulljournalname || doc.source || "",
      pubDate: doc.pubdate || "",
    };
  } catch {
    return null;
  }
}

// ─── Step 3: Fetch full text ───

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
  // Simple XML text extraction
  let text = xml
    .replace(/<xref[^>]*>.*?<\/xref>/g, "") // Remove cross-references
    .replace(/<ref[^>]*>.*?<\/ref>/g, "")   // Remove references
    .replace(/<[^>]+>/g, " ")               // Remove all tags
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Try to extract body content (skip front matter and references)
  const bodyStart = text.indexOf("Introduction");
  const refStart = text.indexOf("References");

  if (bodyStart !== -1 && refStart !== -1 && refStart > bodyStart) {
    text = text.substring(bodyStart, refStart);
  } else if (bodyStart !== -1) {
    text = text.substring(bodyStart, bodyStart + 50000); // Limit to 50k chars
  } else {
    text = text.substring(0, 50000);
  }

  return text;
}

// ─── Step 4: Ingest ───

async function ingest(article: Article): Promise<boolean> {
  const payload = {
    title: article.title,
    organization: "pubmed",
    content: article.content || article.title,
    documentType: "medical_article",
    publicationDate: article.pubDate || undefined,
    tags: [article.journal, "pubmed", "open-access"],
    chunkerName: "recursive",
  };

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.ADMIN_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.ADMIN_TOKEN}`;
    }

    const res = await fetch(`${API_URL}/api/rag-admin/ingest`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`   ❌ Failed (${res.status}): ${err.substring(0, 100)}`);
      return false;
    }

    const result = await res.json();
    console.log(`   ✅ Ingested: chunks=${result.chunksCreated || "?"}`);
    return true;
  } catch (err) {
    console.error(`   ❌ Error: ${err}`);
    return false;
  }
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const query = args[0];
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 10 : 10;

  if (!query) {
    console.log(`
Usage:
  npx tsx scripts/ingest-pubmed.ts "cardiovascular guidelines"
  npx tsx scripts/ingest-pubmed.ts "diabetes management" --limit 20

Environment:
  API_URL      Backend URL (default: http://localhost:3000)
  ADMIN_TOKEN  Admin auth token
`);
    process.exit(1);
  }

  console.log(`\n📚 PubMed → MedAI RAG Ingestion`);
  console.log(`   Query: "${query}"`);
  console.log(`   Limit: ${limit}`);
  console.log(`   API: ${API_URL}\n`);

  // Search
  const pmcids = await searchPMC(query, limit);
  if (pmcids.length === 0) {
    console.log("   No articles found. Try different keywords.");
    return;
  }

  let ok = 0, fail = 0;

  for (let i = 0; i < pmcids.length; i++) {
    const pmcid = pmcids[i];
    console.log(`\n📄 [${i + 1}/${pmcids.length}] ${pmcid}`);

    // Metadata
    const meta = await fetchSummary(pmcid);
    if (!meta) { fail++; continue; }
    console.log(`   ${meta.title.substring(0, 60)}...`);

    // Full text
    const fullText = await fetchFullText(pmcid);
    if (!fullText || fullText.length < 100) {
      console.log(`   ⚠️  No full text available, using abstract`);
    }

    const article: Article = {
      pmcid,
      title: meta.title,
      content: fullText || meta.title,
      authors: meta.authors,
      journal: meta.journal,
      pubDate: meta.pubDate,
    };

    // Ingest
    const success = await ingest(article);
    if (success) ok++;
    else fail++;

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 Done!`);
  console.log(`   ✅ Ingested: ${ok}`);
  console.log(`   ❌ Failed: ${fail}`);
  console.log(`\nYour RAG knowledge base now has ${ok} new medical documents.`);
}

main().catch(console.error);
