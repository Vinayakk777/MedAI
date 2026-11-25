import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  db as workspaceDb,
  medicalDocumentsTable,
  documentChunksTable,
} from "@workspace/db";
import { RagEngine } from "../../src/lib/rag/ragEngine";
import { CitationEngine } from "../../src/lib/rag/retrieval/citationEngine";
import { buildCitationFooter } from "../../src/lib/rag/citationFooter";
import {
  buildInsufficientInfoResponse,
  classifyQueryRisk,
} from "../../src/lib/safety/queryClassifier";
import { applyResponseGate } from "../../src/lib/safety/responseGate";
import {
  extractCitationReferences,
  validateCitations,
} from "../../src/lib/safety/citationValidation";
import {
  sanitizeUntrustedEvidence,
  wrapUntrustedEvidence,
} from "../../src/lib/safety/untrustedEvidence";
import type { CitationEvidence } from "../../src/lib/rag/types";
import type { SafetyEvaluation } from "../../src/lib/safety/types";
import {
  validateDataset,
  type AbstainReason,
  type ExpectedBehavior,
  type GoldenCase,
  type GoldenDataset,
} from "./dataset";
import {
  answerCitationPrecision,
  citationCoverage,
  faithfulnessProxy,
  mean,
  meanBoolean,
  recallAtK,
  reciprocalRank,
  retrievalCitationPrecision,
  routeMatches,
  type FaithfulnessResult,
  type RouteBehavior,
} from "./metrics";
import {
  buildVocabulary,
  createDeterministicEmbedder,
  createFixtureVectorStore,
  installKeywordSearchFixture,
} from "./retrievalFixture";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  RRF_CONFIG,
  resolveRetrievalConfig,
  type RetrievalConfig,
} from "../../src/lib/rag/retrieval/retrievalConfig";

const EVAL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NO_EVIDENCE_MESSAGE = new CitationEngine().formatNoEvidenceMessage();
const RAW_INJECTION_PATTERN =
  /ignore\s+all\s+previous\s+instructions|reveal\s+your\s+system\s+prompt/i;
const REDACTION_MARKER = "[redacted untrusted instruction]";

export interface EvalRetrievalResult {
  eligible: boolean;
  retrievedChunkIds: string[];
  relevantChunkIds: string[];
  missingRelevantChunkIds: string[];
  unexpectedRetrievedChunkIds: string[];
  recallAtK: Record<string, number | null>;
  reciprocalRank: number | null;
  citationPrecision: number | null;
}

export interface EvalCitationResult {
  expectedCitationIds: string[];
  coverage: boolean | null;
  candidateReferenceCount: number;
  candidateInvalidReferenceCount: number;
  candidatePrecision: number | null;
  deliveredReferenceCount: number;
  deliveredInvalidReferenceCount: number;
  deliveredPrecision: number | null;
  validationIssues: string[];
}

export interface EvalInjectionResult {
  detected: boolean;
  evidenceContainsRedaction: boolean;
  rawInstructionAbsent: boolean;
}

export interface EvalCaseResult {
  id: string;
  question: string;
  tags: string[];
  expectedBehavior: ExpectedBehavior;
  expectedAbstainReason?: AbstainReason;
  actualBehavior: RouteBehavior;
  routeCorrect: boolean;
  passed: boolean;
  failureReasons: string[];
  riskLevel: string;
  gateReason: string;
  retrievalLatencyMs: number | null;
  retrieval: EvalRetrievalResult;
  citations: EvalCitationResult;
  faithfulness: FaithfulnessResult;
  injection: EvalInjectionResult;
  deliveredText: string;
}

export interface EvalLatency {
  count: number;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export interface EvalReport {
  dataset: {
    name: string;
    version: string;
    createdAt: string;
    caseCount: number;
    documentCount: number;
    chunkCount: number;
  };
  config: Record<string, unknown>;
  generatedAt: string;
  metrics: {
    retrieval: {
      caseCount: number;
      recallAtK: Record<string, number | null>;
      mrr: number | null;
      citationPrecision: number | null;
    };
    citations: {
      retrievalPrecision: number | null;
      deliveredPrecision: number | null;
      candidatePrecision: number | null;
      coverage: number | null;
      casesWithExpectedCitations: number;
    };
    faithfulness: {
      answerCases: number;
      factCoverage: number | null;
      supportedFactRate: number | null;
      unsupportedFacts: string[];
      missingFacts: string[];
    };
    latency: EvalLatency;
    routes: {
      total: number;
      correct: number;
      accuracy: number;
      answer: { expected: number; actual: number; correct: number };
      abstain: { expected: number; actual: number; correct: number };
      emergency: { expected: number; actual: number; correct: number };
    };
  };
  cases: EvalCaseResult[];
  failedCases: EvalCaseResult[];
}

interface RunOptions {
  db?: any;
  outputDir?: string;
  retrievalConfig?: Partial<RetrievalConfig>;
  /** Clear the fixture database before seeding. Only applies to fake DBs. */
  reset?: boolean;
}

function allowSafetyEvaluation(
  queryText: string,
  responseText: string,
): SafetyEvaluation {
  return {
    responseText,
    queryText,
    overallStatus: "passed",
    action: "allow",
    results: [],
    scores: {
      qualityScore: 90,
      hallucinationScore: 95,
      confidenceScore: 80,
      clinicalRiskScore: 10,
      evidenceCoverageScore: 100,
      missingInformationScore: 0,
      retrievalQualityScore: 100,
    },
    latencyMs: 0,
  };
}

async function seedDatabase(
  db: any,
  dataset: GoldenDataset,
): Promise<void> {
  await db.insert(medicalDocumentsTable).values(
    dataset.documents.map((document) => ({
      id: document.id,
      sourceId: document.sourceId ?? null,
      title: document.title,
      organization: document.organization,
      publicationDate: new Date(document.publicationDate),
      url: document.url ?? null,
      author: document.author ?? null,
      metadata: document.metadata ?? {},
    })),
  );

  await db.insert(documentChunksTable).values(
    dataset.chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      sourceId: chunk.sourceId ?? null,
      content: chunk.content,
      contentPreview: chunk.content.slice(0, 200),
      section: chunk.section ?? null,
      heading: chunk.heading ?? null,
      metadata: chunk.metadata ?? {},
    })),
  );
}

function retrievalFor(
  dataset: GoldenDataset,
  testCase: GoldenCase,
  citations: CitationEvidence[],
): EvalRetrievalResult {
  const retrievedChunkIds = citations.map((citation) => citation.chunkId);
  const relevantChunkIds = testCase.relevantChunkIds;
  const eligible =
    testCase.expectedBehavior === "answer" && relevantChunkIds.length > 0;

  const recall: Record<string, number | null> = {};
  for (const k of dataset.config.recallK) {
    recall[String(k)] = eligible
      ? recallAtK(retrievedChunkIds, relevantChunkIds, k)
      : null;
  }

  return {
    eligible,
    retrievedChunkIds,
    relevantChunkIds,
    missingRelevantChunkIds: relevantChunkIds.filter(
      (id) => !retrievedChunkIds.includes(id),
    ),
    unexpectedRetrievedChunkIds: retrievedChunkIds.filter(
      (id) => !relevantChunkIds.includes(id),
    ),
    recallAtK: recall,
    reciprocalRank: eligible
      ? reciprocalRank(retrievedChunkIds, relevantChunkIds)
      : null,
    citationPrecision: eligible
      ? retrievalCitationPrecision(retrievedChunkIds, relevantChunkIds)
      : null,
  };
}

function countInvalidReferences(issues: string[]): number {
  return issues.filter((issue) =>
    issue.startsWith("unverified_citation_identifier:"),
  ).length;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function summarizeLatency(
  values: Array<number | null | undefined>,
): EvalLatency {
  const numeric = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (numeric.length === 0) {
    return { count: 0, meanMs: null, p50Ms: null, p95Ms: null, maxMs: null };
  }

  return {
    count: numeric.length,
    meanMs: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    p50Ms: percentile(numeric, 50),
    p95Ms: percentile(numeric, 95),
    maxMs: Math.max(...numeric),
  };
}

function failureReasonsFor(
  testCase: GoldenCase,
  actualBehavior: RouteBehavior,
  gateReason: string,
  deliveredText: string,
  retrieval: EvalRetrievalResult,
  citations: EvalCitationResult,
  faithfulness: FaithfulnessResult,
  injection: EvalInjectionResult,
): string[] {
  const reasons: string[] = [];

  if (!routeMatches(testCase.expectedBehavior, actualBehavior)) {
    reasons.push(
      `route_mismatch: expected=${testCase.expectedBehavior} actual=${actualBehavior}`,
    );
  }

  if (testCase.expectedBehavior === "answer") {
    if (faithfulness.factCoverage !== 1) {
      reasons.push(
        `missing_key_facts: ${faithfulness.missingFacts.join(" | ") || "none"}`,
      );
    }
    if (
      faithfulness.supportedFactRate !== null &&
      faithfulness.supportedFactRate < 1
    ) {
      reasons.push(
        `unsupported_key_facts: ${faithfulness.unsupportedFacts.join(" | ") || "none"}`,
      );
    }
    if (citations.coverage === false) {
      reasons.push("citation_coverage_miss");
    }
    if (retrieval.eligible && retrieval.reciprocalRank === 0) {
      reasons.push("no_relevant_chunk_retrieved");
    }
  }

  if (testCase.expectedBehavior === "abstain" && testCase.abstainReason) {
    if (testCase.abstainReason === "insufficient_evidence") {
      if (
        gateReason !== "no_retrieved_evidence" &&
        gateReason !== "insufficient_info_short_circuit"
      ) {
        reasons.push(`unexpected_abstain_reason: ${gateReason}`);
      }
    }
    if (testCase.abstainReason === "unsafe_advice") {
      const allowed = new Set([
        "unsupported_diagnosis",
        "individualized_medication_advice",
        "citation_validation_failed",
        "safety_block",
        "safety_fallback",
        "safety_rewrite",
        "safety_incomplete",
        "safety_check_failed",
        "safety_check_missing",
      ]);
      if (!allowed.has(gateReason)) {
        reasons.push(`unexpected_abstain_reason: ${gateReason}`);
      }
    }
    if (testCase.abstainReason === "invalid_citation") {
      if (gateReason !== "citation_validation_failed") {
        reasons.push(`unexpected_abstain_reason: ${gateReason}`);
      }
    }
  }

  if (testCase.expectedBehavior === "emergency") {
    if (!/emergency|911|108|988/i.test(deliveredText)) {
      reasons.push("emergency_message_missing_escalation");
    }
  }

  if (testCase.tags.includes("prompt_injection")) {
    if (
      !injection.detected ||
      !injection.evidenceContainsRedaction ||
      !injection.rawInstructionAbsent
    ) {
      reasons.push("prompt_injection_not_sanitized");
    }
  }

  return reasons;
}

export async function runRagEval(
  dataset: GoldenDataset,
  options: RunOptions = {},
): Promise<EvalReport> {
  const validationErrors = validateDataset(dataset);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid golden dataset:\n${validationErrors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }

  const db = options.db ?? workspaceDb;
  const retrievalConfig = resolveRetrievalConfig(options.retrievalConfig);

  if (options.reset && db.__fake && typeof db.__fake.clear === "function") {
    db.__fake.clear();
  }

  const restoreKeywordSearch = installKeywordSearchFixture(db, dataset.chunks);

  try {
    await seedDatabase(db, dataset);

    const vocabulary = buildVocabulary([
      ...dataset.documents.flatMap((document) => [
        document.title,
        document.organization,
        document.author ?? "",
      ]),
      ...dataset.chunks.flatMap((chunk) => [
        chunk.content,
        chunk.section ?? "",
        chunk.heading ?? "",
      ]),
      ...dataset.cases.flatMap((testCase) => [
        testCase.question,
        testCase.fixtureAnswer,
      ]),
    ]);

    const embedder = createDeterministicEmbedder(vocabulary);
    const vectorStore = await createFixtureVectorStore(
      dataset.chunks,
      embedder,
    );
    const engine = new RagEngine({
      vectorStore,
      embedder,
      maxRetries: 0,
      retrievalConfig,
    });

    const caseResults: EvalCaseResult[] = [];

    for (const testCase of dataset.cases) {
      const risk = classifyQueryRisk(testCase.question);
      const skipRetrieval =
        risk.riskLevel === "emergency" || risk.riskLevel === "insufficient";

      let citations: CitationEvidence[] = [];
      let promptEvidence = "";
      let retrievalLatencyMs: number | null = null;

      if (!skipRetrieval) {
        const retrievalStart = performance.now();
        const formatted = await engine.formatEvidenceForPrompt({
          text: testCase.question,
          pipelineStage: (testCase.pipelineStage ??
            dataset.config.pipelineStage ??
            "general") as any,
          topK: dataset.config.topK,
          useCache: false,
        });
        retrievalLatencyMs = performance.now() - retrievalStart;
        citations = formatted.citations;

        // Mirror the chat route: sanitize the formatted evidence block and
        // mark it as an untrusted data boundary before it reaches a model.
        const sanitized = sanitizeUntrustedEvidence(formatted.evidenceBlock);
        promptEvidence = wrapUntrustedEvidence(sanitized.text);
      }

      const retrievedChunkIds = citations.map((citation) => citation.chunkId);
      const retrievedChunks = dataset.chunks.filter((chunk) =>
        retrievedChunkIds.includes(chunk.id),
      );
      const injectionDetected = retrievedChunks.some((chunk) =>
        RAW_INJECTION_PATTERN.test(chunk.content),
      );
      const injection = {
        detected: injectionDetected,
        evidenceContainsRedaction: promptEvidence.includes(REDACTION_MARKER),
        rawInstructionAbsent: !RAW_INJECTION_PATTERN.test(promptEvidence),
      };

      let actualBehavior: RouteBehavior;
      let deliveredText = "";
      let gateReason = "";
      let candidateText = "";
      let validationIssues: string[] = [];
      let candidateInvalidReferenceCount = 0;

      if (risk.riskLevel === "emergency") {
        actualBehavior = "emergency";
        deliveredText =
          risk.shortCircuitMessage ??
          "Please seek immediate medical attention.";
        gateReason = "emergency_short_circuit";
      } else if (risk.riskLevel === "insufficient") {
        actualBehavior = "abstain";
        deliveredText = buildInsufficientInfoResponse(testCase.question);
        gateReason = "insufficient_info_short_circuit";
      } else if (citations.length === 0) {
        actualBehavior = "abstain";
        deliveredText = NO_EVIDENCE_MESSAGE;
        gateReason = "no_retrieved_evidence";
      } else {
        candidateText = testCase.fixtureAnswer + buildCitationFooter(citations);
        const gate = applyResponseGate({
          generatedText: candidateText,
          citations,
          safety: allowSafetyEvaluation(testCase.question, candidateText),
        });
        validationIssues = gate.citationValidation.issues;
        candidateInvalidReferenceCount = countInvalidReferences(validationIssues);
        gateReason = gate.reason;
        actualBehavior = gate.safe ? "answer" : "abstain";
        deliveredText = gate.responseText;
      }

      const candidateReferences = extractCitationReferences(candidateText);
      const deliveredReferences = extractCitationReferences(deliveredText);
      const deliveredValidation = validateCitations(deliveredText, citations);
      const deliveredInvalidReferenceCount = countInvalidReferences(
        deliveredValidation.issues,
      );

      const retrieval = retrievalFor(dataset, testCase, citations);
      const citationResult: EvalCitationResult = {
        expectedCitationIds: testCase.expectedCitationIds,
        coverage: citationCoverage(
          deliveredText,
          testCase.expectedCitationIds,
        ),
        candidateReferenceCount: candidateReferences.length,
        candidateInvalidReferenceCount,
        candidatePrecision: answerCitationPrecision(
          candidateReferences.length,
          candidateInvalidReferenceCount,
        ),
        deliveredReferenceCount: deliveredReferences.length,
        deliveredInvalidReferenceCount,
        deliveredPrecision: answerCitationPrecision(
          deliveredReferences.length,
          deliveredInvalidReferenceCount,
        ),
        validationIssues,
      };
      const faithfulness = faithfulnessProxy(
        deliveredText,
        testCase.keyFacts,
        citations.map((citation) => citation.evidenceText),
      );

      const failureReasons = failureReasonsFor(
        testCase,
        actualBehavior,
        gateReason,
        deliveredText,
        retrieval,
        citationResult,
        faithfulness,
        injection,
      );

      caseResults.push({
        id: testCase.id,
        question: testCase.question,
        tags: testCase.tags,
        expectedBehavior: testCase.expectedBehavior,
        expectedAbstainReason: testCase.abstainReason,
        actualBehavior,
        routeCorrect: routeMatches(
          testCase.expectedBehavior,
          actualBehavior,
        ),
        passed: failureReasons.length === 0,
        failureReasons,
        riskLevel: risk.riskLevel,
        gateReason,
        retrievalLatencyMs,
        retrieval,
        citations: citationResult,
        faithfulness,
        injection,
        deliveredText,
      });
    }

    const answerCases = caseResults.filter(
      (result) => result.expectedBehavior === "answer",
    );
    const retrievalCases = answerCases.filter(
      (result) => result.retrieval.eligible,
    );

    const recallAtK: Record<string, number | null> = {};
    for (const k of dataset.config.recallK) {
      recallAtK[String(k)] = mean(
        retrievalCases.map(
          (result) => result.retrieval.recallAtK[String(k)] ?? null,
        ),
      );
    }

    const routeCounts = {
      answer: { expected: 0, actual: 0, correct: 0 },
      abstain: { expected: 0, actual: 0, correct: 0 },
      emergency: { expected: 0, actual: 0, correct: 0 },
    };
    for (const result of caseResults) {
      routeCounts[result.expectedBehavior].expected += 1;
      routeCounts[result.actualBehavior].actual += 1;
      if (result.routeCorrect) {
        routeCounts[result.expectedBehavior].correct += 1;
      }
    }
    const routeCorrect = caseResults.filter(
      (result) => result.routeCorrect,
    ).length;

    const report: EvalReport = {
      dataset: {
        name: dataset.name,
        version: dataset.version,
        createdAt: dataset.createdAt,
        caseCount: dataset.cases.length,
        documentCount: dataset.documents.length,
        chunkCount: dataset.chunks.length,
      },
      config: {
        datasetVersion: dataset.version,
        topK: dataset.config.topK,
        recallK: dataset.config.recallK,
        pipelineStage: dataset.config.pipelineStage,
        fusion: retrievalConfig.fusion,
        rrfK: retrievalConfig.rrfK,
        semanticWeight: retrievalConfig.semanticWeight,
        keywordWeight: retrievalConfig.keywordWeight,
        candidateMultiplier: retrievalConfig.candidateMultiplier,
        finalTopKMultiplier: retrievalConfig.finalTopKMultiplier,
        minCombinedScore: retrievalConfig.minCombinedScore,
        minSemanticScore: retrievalConfig.minSemanticScore,
        minKeywordScore: retrievalConfig.minKeywordScore,
        embedding: "deterministic-bag-of-words-v1",
        vectorStore: "in-memory-fixture",
        keywordSearch: "in-memory-tsquery-proxy",
        queryRewrite: "production fallback (LLM fixture returns null)",
        reranker: "production fallback (LLM fixture returns null)",
        answerGeneration: "golden fixture answers (no live LLM)",
        safety: "deterministic-allow (LLM safety framework not invoked)",
        noEvidencePolicy: "abstain with production no-evidence disclosure",
        latency: "local fixture timing; not production latency",
        networkCalls: false,
      },
      generatedAt: new Date().toISOString(),
      metrics: {
        retrieval: {
          caseCount: retrievalCases.length,
          recallAtK,
          mrr: mean(
            retrievalCases.map((result) => result.retrieval.reciprocalRank),
          ),
          citationPrecision: mean(
            retrievalCases.map(
              (result) => result.retrieval.citationPrecision,
            ),
          ),
        },
        citations: {
          retrievalPrecision: mean(
            retrievalCases.map(
              (result) => result.retrieval.citationPrecision,
            ),
          ),
          deliveredPrecision: mean(
            caseResults.map(
              (result) => result.citations.deliveredPrecision,
            ),
          ),
          candidatePrecision: mean(
            caseResults.map(
              (result) => result.citations.candidatePrecision,
            ),
          ),
          coverage: meanBoolean(
            answerCases.map((result) => result.citations.coverage),
          ),
          casesWithExpectedCitations: answerCases.filter(
            (result) => result.citations.expectedCitationIds.length > 0,
          ).length,
        },
        faithfulness: {
          answerCases: answerCases.length,
          factCoverage: mean(
            answerCases.map((result) => result.faithfulness.factCoverage),
          ),
          supportedFactRate: mean(
            answerCases.map(
              (result) => result.faithfulness.supportedFactRate,
            ),
          ),
          unsupportedFacts: answerCases.flatMap(
            (result) => result.faithfulness.unsupportedFacts,
          ),
          missingFacts: answerCases.flatMap(
            (result) => result.faithfulness.missingFacts,
          ),
        },
        latency: summarizeLatency(
          caseResults.map((result) => result.retrievalLatencyMs),
        ),
        routes: {
          total: caseResults.length,
          correct: routeCorrect,
          accuracy:
            caseResults.length > 0
              ? routeCorrect / caseResults.length
              : 0,
          ...routeCounts,
        },
      },
      cases: caseResults,
      failedCases: caseResults.filter((result) => !result.passed),
    };

    if (options.outputDir) {
      writeEvalReports(report, options.outputDir);
    }

    return report;
  } finally {
    restoreKeywordSearch();
  }
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderMarkdownReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("# MedAI RAG Golden Evaluation");
  lines.push("");
  lines.push(
    `- Dataset: **${report.dataset.name}** v${report.dataset.version}`,
  );
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(
    `- Cases: ${report.dataset.caseCount} | Documents: ${report.dataset.documentCount} | Chunks: ${report.dataset.chunkCount}`,
  );
  lines.push(`- Fusion: ${String(report.config.fusion ?? "unknown")}`);
  lines.push(`- Network calls: ${report.config.networkCalls ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [k, value] of Object.entries(report.metrics.retrieval.recallAtK)) {
    lines.push(`| Retrieval Recall@${k} | ${formatMetric(value)} |`);
  }
  lines.push(
    `| Retrieval MRR | ${formatMetric(report.metrics.retrieval.mrr)} |`,
  );
  lines.push(
    `| Retrieval citation precision | ${formatMetric(report.metrics.citations.retrievalPrecision)} |`,
  );
  lines.push(
    `| Delivered answer citation precision | ${formatMetric(report.metrics.citations.deliveredPrecision)} |`,
  );
  lines.push(
    `| Candidate citation precision (pre-gate) | ${formatMetric(report.metrics.citations.candidatePrecision)} |`,
  );
  lines.push(
    `| Citation coverage | ${formatMetric(report.metrics.citations.coverage)} |`,
  );
  lines.push(
    `| Answer fact coverage | ${formatMetric(report.metrics.faithfulness.factCoverage)} |`,
  );
  lines.push(
    `| Supported fact rate | ${formatMetric(report.metrics.faithfulness.supportedFactRate)} |`,
  );
  lines.push(
    `| Route accuracy | ${formatMetric(report.metrics.routes.accuracy)} (${report.metrics.routes.correct}/${report.metrics.routes.total}) |`,
  );
  lines.push(
    `| Retrieval latency mean (local fixture) | ${report.metrics.latency.meanMs === null ? "n/a" : `${report.metrics.latency.meanMs.toFixed(2)} ms`} |`,
  );
  lines.push(
    `| Retrieval latency p95 (local fixture) | ${report.metrics.latency.p95Ms === null ? "n/a" : `${report.metrics.latency.p95Ms.toFixed(2)} ms`} |`,
  );
  lines.push("");
  lines.push("## Route outcomes");
  lines.push("");
  lines.push("| Expected | Cases | Correct | Actual answer | Actual abstain | Actual emergency |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const behavior of ["answer", "abstain", "emergency"] as const) {
    const bucket = report.metrics.routes[behavior];
    const actualAnswer = report.cases.filter(
      (result) =>
        result.expectedBehavior === behavior &&
        result.actualBehavior === "answer",
    ).length;
    const actualAbstain = report.cases.filter(
      (result) =>
        result.expectedBehavior === behavior &&
        result.actualBehavior === "abstain",
    ).length;
    const actualEmergency = report.cases.filter(
      (result) =>
        result.expectedBehavior === behavior &&
        result.actualBehavior === "emergency",
    ).length;
    lines.push(
      `| ${behavior} | ${bucket.expected} | ${bucket.correct} | ${actualAnswer} | ${actualAbstain} | ${actualEmergency} |`,
    );
  }
  lines.push("");
  lines.push("## Per-case results");
  lines.push("");
  lines.push(
    "| Case | Expected | Actual | Pass | Gate reason | Recall@3 | MRR |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const result of report.cases) {
    lines.push(
      `| ${escapeCell(result.id)} | ${result.expectedBehavior} | ${result.actualBehavior} | ${result.passed ? "yes" : "no"} | ${escapeCell(result.gateReason)} | ${formatMetric(result.retrieval.recallAtK["3"] ?? null)} | ${formatMetric(result.retrieval.reciprocalRank)} |`,
    );
  }
  lines.push("");
  lines.push("## Failed cases");
  lines.push("");
  if (report.failedCases.length === 0) {
    lines.push("No cases failed the configured checks.");
    lines.push("");
  } else {
    for (const result of report.failedCases) {
      lines.push(`### ${result.id}`);
      lines.push("");
      lines.push(`- Question: ${result.question}`);
      lines.push(
        `- Expected: ${result.expectedBehavior}${result.expectedAbstainReason ? ` (${result.expectedAbstainReason})` : ""}`,
      );
      lines.push(`- Actual: ${result.actualBehavior}`);
      lines.push(`- Gate reason: ${result.gateReason}`);
      lines.push(`- Reasons: ${result.failureReasons.join("; ")}`);
      lines.push(
        `- Retrieved chunks: ${result.retrieval.retrievedChunkIds.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Labeled relevant chunks: ${result.retrieval.relevantChunkIds.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Missing relevant chunks: ${result.retrieval.missingRelevantChunkIds.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Unexpected retrieved chunks: ${result.retrieval.unexpectedRetrievedChunkIds.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Citation issues: ${result.citations.validationIssues.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Missing key facts: ${result.faithfulness.missingFacts.join(", ") || "(none)"}`,
      );
      lines.push(
        `- Unsupported key facts: ${result.faithfulness.unsupportedFacts.join(", ") || "(none)"}`,
      );
      lines.push("");
    }
  }
  lines.push("## Limitations");
  lines.push("");
  lines.push(
    "Synthetic data only; not clinical guidance. Retrieval uses a deterministic bag-of-words embedding and an in-memory keyword-search proxy rather than production embeddings or PostgreSQL full-text search. Query rewriting and LLM reranking use their production fallback paths because the LLM fixture returns no data. Answer generation is a fixture, and faithfulness is lexical support, not entailment. The LLM-based safety framework is not invoked; the deterministic delivery gate is. Latency is local fixture timing and is not production latency. See `artifacts/api-server/eval/README.md` for definitions.",
  );
  lines.push("");
  return lines.join("\n");
}

export function writeEvalReports(
  report: EvalReport,
  outputDir: string = path.join(EVAL_DIR, "reports"),
  fileStem: string = "rag-eval-report",
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, `${fileStem}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputDir, `${fileStem}.md`),
    renderMarkdownReport(report),
    "utf8",
  );
}

// ─── Baseline vs hybrid comparison ───

export interface ComparisonMetricRow {
  key: string;
  label: string;
  baseline: number | null;
  hybrid: number | null;
  delta: number | null;
  /** "neutral" means the metric is reported for context, not as a goal. */
  betterWhen: "higher" | "lower" | "neutral";
}

export interface EvalComparison {
  generatedAt: string;
  dataset: EvalReport["dataset"];
  baseline: {
    label: string;
    config: Record<string, unknown>;
    metrics: EvalReport["metrics"];
  };
  hybrid: {
    label: string;
    config: Record<string, unknown>;
    metrics: EvalReport["metrics"];
  };
  rows: ComparisonMetricRow[];
  cases: Array<{
    id: string;
    baselineRetrieved: string[];
    hybridRetrieved: string[];
    baselinePassed: boolean;
    hybridPassed: boolean;
  }>;
  disclaimer: string;
}

export interface ComparisonOptions extends Omit<RunOptions, "retrievalConfig"> {
  baselineConfig?: Partial<RetrievalConfig>;
  hybridConfig?: Partial<RetrievalConfig>;
}

function deltaOf(
  baseline: number | null,
  hybrid: number | null,
): number | null {
  if (baseline === null || hybrid === null) return null;
  return hybrid - baseline;
}

function buildComparison(
  baseline: EvalReport,
  hybrid: EvalReport,
): EvalComparison {
  const rows: ComparisonMetricRow[] = [];

  const addRow = (
    key: string,
    label: string,
    baselineValue: number | null,
    hybridValue: number | null,
    betterWhen: "higher" | "lower" | "neutral",
  ) => {
    rows.push({
      key,
      label,
      baseline: baselineValue,
      hybrid: hybridValue,
      delta: deltaOf(baselineValue, hybridValue),
      betterWhen,
    });
  };

  for (const k of Object.keys(baseline.metrics.retrieval.recallAtK)) {
    addRow(
      `recall@${k}`,
      `Retrieval Recall@${k}`,
      baseline.metrics.retrieval.recallAtK[k] ?? null,
      hybrid.metrics.retrieval.recallAtK[k] ?? null,
      "higher",
    );
  }

  addRow(
    "mrr",
    "Retrieval MRR",
    baseline.metrics.retrieval.mrr,
    hybrid.metrics.retrieval.mrr,
    "higher",
  );
  addRow(
    "retrieval-citation-precision",
    "Retrieval citation precision",
    baseline.metrics.citations.retrievalPrecision,
    hybrid.metrics.citations.retrievalPrecision,
    "higher",
  );
  addRow(
    "delivered-citation-precision",
    "Delivered answer citation precision",
    baseline.metrics.citations.deliveredPrecision,
    hybrid.metrics.citations.deliveredPrecision,
    "higher",
  );
  addRow(
    "citation-coverage",
    "Citation coverage",
    baseline.metrics.citations.coverage,
    hybrid.metrics.citations.coverage,
    "higher",
  );
  addRow(
    "route-accuracy",
    "Route accuracy",
    baseline.metrics.routes.accuracy,
    hybrid.metrics.routes.accuracy,
    "higher",
  );
  addRow(
    "latency-mean",
    "Retrieval latency mean (ms, local fixture)",
    baseline.metrics.latency.meanMs,
    hybrid.metrics.latency.meanMs,
    "neutral",
  );
  addRow(
    "latency-p95",
    "Retrieval latency p95 (ms, local fixture)",
    baseline.metrics.latency.p95Ms,
    hybrid.metrics.latency.p95Ms,
    "neutral",
  );

  const meanRetrievedCandidates = (report: EvalReport): number | null => {
    const eligible = report.cases.filter((testCase) => testCase.retrieval.eligible);
    if (eligible.length === 0) return null;
    return (
      eligible.reduce(
        (sum, testCase) => sum + testCase.retrieval.retrievedChunkIds.length,
        0,
      ) / eligible.length
    );
  };

  // Context, not a goal: candidate-set size explains why the retrieved-set
  // precision below is not a like-for-like comparison between the two modes.
  addRow(
    "mean-retrieved-candidates",
    "Mean retrieved candidates per answer case",
    meanRetrievedCandidates(baseline),
    meanRetrievedCandidates(hybrid),
    "neutral",
  );

  const baselineCases = new Map(
    baseline.cases.map((testCase) => [testCase.id, testCase]),
  );
  const hybridCases = new Map(
    hybrid.cases.map((testCase) => [testCase.id, testCase]),
  );

  const cases = [...new Set([...baselineCases.keys(), ...hybridCases.keys()])]
    .sort()
    .map((id) => {
      const baselineCase = baselineCases.get(id);
      const hybridCase = hybridCases.get(id);
      return {
        id,
        baselineRetrieved: baselineCase?.retrieval.retrievedChunkIds ?? [],
        hybridRetrieved: hybridCase?.retrieval.retrievedChunkIds ?? [],
        baselinePassed: baselineCase?.passed ?? false,
        hybridPassed: hybridCase?.passed ?? false,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    dataset: hybrid.dataset,
    baseline: {
      label: "Weighted score fusion (0.7 semantic / 0.3 keyword)",
      config: baseline.config,
      metrics: baseline.metrics,
    },
    hybrid: {
      label: "Reciprocal Rank Fusion",
      config: hybrid.config,
      metrics: hybrid.metrics,
    },
    rows,
    cases,
    disclaimer:
      "Fixture comparison only. Semantic retrieval uses a deterministic bag-of-words embedding and keyword retrieval uses an in-memory tsquery proxy, so these deltas describe pipeline behavior on the golden dataset, not production model quality. Latency is local fixture timing. No production improvement is claimed.",
  };
}

export async function runRagEvalComparison(
  dataset: GoldenDataset,
  options: ComparisonOptions = {},
): Promise<{
  baseline: EvalReport;
  hybrid: EvalReport;
  comparison: EvalComparison;
}> {
  const outputDir = options.outputDir ?? path.join(EVAL_DIR, "reports");
  const baselineConfig = resolveRetrievalConfig({
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...options.baselineConfig,
  });
  const hybridConfig = resolveRetrievalConfig({
    ...RRF_CONFIG,
    ...options.hybridConfig,
  });

  const baseline = await runRagEval(dataset, {
    db: options.db,
    reset: true,
    retrievalConfig: baselineConfig,
  });
  const hybrid = await runRagEval(dataset, {
    db: options.db,
    reset: true,
    retrievalConfig: hybridConfig,
  });

  const comparison = buildComparison(baseline, hybrid);

  writeEvalReports(baseline, outputDir, "rag-eval-baseline");
  writeEvalReports(hybrid, outputDir, "rag-eval-report");
  writeComparisonReports(comparison, outputDir);

  return { baseline, hybrid, comparison };
}

function formatSigned(value: number | null, digits = 3): string {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

function outcomeFor(row: ComparisonMetricRow): string {
  if (row.delta === null) return "not comparable";
  if (row.betterWhen === "neutral") return "context only";
  if (Math.abs(row.delta) < 1e-9) return "unchanged";
  const improved =
    row.betterWhen === "higher" ? row.delta > 0 : row.delta < 0;
  return improved ? "better" : "worse";
}

export function renderComparisonMarkdown(
  comparison: EvalComparison,
): string {
  const lines: string[] = [];
  lines.push("# MedAI Hybrid Retrieval Evaluation: Baseline vs RRF");
  lines.push("");
  lines.push(
    `- Dataset: **${comparison.dataset.name}** v${comparison.dataset.version}`,
  );
  lines.push(`- Generated: ${comparison.generatedAt}`);
  lines.push(
    `- Cases: ${comparison.dataset.caseCount} | Documents: ${comparison.dataset.documentCount} | Chunks: ${comparison.dataset.chunkCount}`,
  );
  lines.push(`- Baseline: ${comparison.baseline.label}`);
  lines.push(`- Hybrid: ${comparison.hybrid.label}`);
  lines.push(
    `- Production default fusion: ${DEFAULT_RETRIEVAL_CONFIG.fusion} (RRF is opt-in via \`retrievalConfig.fusion = "rrf"\`)`,
  );
  lines.push(`- RRF k: ${String(comparison.hybrid.config.rrfK ?? "n/a")}`);
  lines.push(
    `- Candidate multiplier: ${String(comparison.hybrid.config.candidateMultiplier ?? "n/a")} | Final top-K multiplier: ${String(comparison.hybrid.config.finalTopKMultiplier ?? "n/a")}`,
  );
  lines.push("");
  lines.push(`> ${comparison.disclaimer}`);
  lines.push("");
  lines.push("## Metric comparison");
  lines.push("");
  lines.push("| Metric | Baseline | Hybrid | Delta | Better when | Outcome |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of comparison.rows) {
    const digits = row.key.startsWith("latency") ? 2 : 3;
    lines.push(
      `| ${escapeCell(row.label)} | ${formatMetric(row.baseline)} | ${formatMetric(row.hybrid)} | ${formatSigned(row.delta, digits)} | ${row.betterWhen} | ${outcomeFor(row)} |`,
    );
  }
  lines.push("");
  lines.push(
    "> `Retrieval citation precision` is `relevant retrieved / all retrieved`, so it is **not** a like-for-like comparison when candidate-set sizes differ. Weighted fusion applies a `minCombinedScore` floor that collapses the candidate set to 1–3 chunks on this corpus, while RRF is rank-based and has no comparable score floor, so it returns the full over-fetched candidate pool. Use `Recall@K`, `MRR`, delivered citation precision and route accuracy for ranking quality; read the retrieval-precision row together with the mean candidate count.",
  );
  lines.push("");
  lines.push("## Per-case retrieval");
  lines.push("");
  lines.push(
    "| Case | Baseline retrieved | Hybrid retrieved | Baseline pass | Hybrid pass |",
  );
  lines.push("| --- | --- | --- | --- | --- |");
  for (const testCase of comparison.cases) {
    lines.push(
      `| ${escapeCell(testCase.id)} | ${escapeCell(testCase.baselineRetrieved.join(", ") || "(none)")} | ${escapeCell(testCase.hybridRetrieved.join(", ") || "(none)")} | ${testCase.baselinePassed ? "yes" : "no"} | ${testCase.hybridPassed ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push(
    "Deltas are computed as hybrid minus baseline. A positive delta is better for recall, MRR, precision, coverage and route accuracy. Latency and candidate-count rows are context only: the fixture is too small for a meaningful timing comparison, and candidate-set size differs by design between the two fusion modes. This report does not claim production improvement: both runs use the same deterministic fixtures and the same golden cases, and the corpus is intentionally small.",
  );
  lines.push("");
  return lines.join("\n");
}

export function writeComparisonReports(
  comparison: EvalComparison,
  outputDir: string = path.join(EVAL_DIR, "reports"),
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "rag-eval-comparison.json"),
    `${JSON.stringify(comparison, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputDir, "rag-eval-comparison.md"),
    renderComparisonMarkdown(comparison),
    "utf8",
  );
}
