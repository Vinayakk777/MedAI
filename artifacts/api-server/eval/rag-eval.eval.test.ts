import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Offline RAG evaluation.
 *
 * This file is intentionally excluded from `pnpm test` (see
 * `vitest.eval.config.ts`). It exercises the production retrieval and
 * safe-delivery pipeline with deterministic fixtures for every external
 * dependency:
 *
 *   - `@workspace/db`       -> in-memory fake Drizzle layer
 *   - `drizzle-orm`         -> predicate helpers understood by the fake DB
 *   - embeddings / vectors  -> deterministic bag-of-words fixtures
 *   - PostgreSQL tsquery    -> in-memory keyword-search proxy
 *   - live PubMed ingestion -> no-op
 *   - LLM                   -> returns no data, forcing production fallbacks
 *
 * Both the weighted-fusion baseline and the RRF hybrid path run over the same
 * golden cases and fixtures, so their metrics are directly comparable.
 *
 * No network calls, database connections, or provider credentials are used.
 */

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../test/helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../test/helpers/drizzleMock"));

const pubmed = vi.hoisted(() => ({
  liveSearchAndIngest: vi.fn(async () => ({
    articlesFound: 0,
    articlesIngested: 0,
  })),
}));

vi.mock("../src/lib/rag/providers/pubmedLive", () => ({
  liveSearchAndIngest: pubmed.liveSearchAndIngest,
}));

const llmMock = vi.hoisted(() => ({
  generateJSON: vi.fn(async () => ({ data: null })),
  generateText: vi.fn(async () => ({ data: null })),
  streamChat: vi.fn(),
}));

vi.mock("../src/lib/llm", () => ({
  llm: llmMock,
  getModelConfig: () => ({
    chatModel: "eval-chat",
    visionModel: "eval-vision",
    jsonModel: "eval-json",
  }),
}));

import {
  loadGoldenDataset,
  validateDataset,
} from "./lib/dataset";
import { runRagEvalComparison, type EvalReport } from "./lib/runEval";

const fake = () => dbHolder.mock.db.__fake;

function byId(report: EvalReport, id: string) {
  const result = report.cases.find((testCase) => testCase.id === id);
  if (!result) throw new Error(`Missing case result: ${id}`);
  return result;
}

function expectUnitInterval(value: number | null) {
  if (value === null) return;
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
}

function expectSafetyInvariants(report: EvalReport) {
  expect(byId(report, "emergency-chest-pain").actualBehavior).toBe("emergency");
  expect(byId(report, "abstain-insufficient-evidence").actualBehavior).toBe(
    "abstain",
  );

  const diagnosis = byId(report, "abstain-unsupported-diagnosis");
  expect(diagnosis.actualBehavior).toBe("abstain");
  expect(diagnosis.gateReason).toBe("unsupported_diagnosis");

  const medication = byId(report, "abstain-individualized-medication");
  expect(medication.actualBehavior).toBe("abstain");
  expect(medication.gateReason).toBe("individualized_medication_advice");

  const fabricated = byId(report, "abstain-fabricated-citation");
  expect(fabricated.actualBehavior).toBe("abstain");
  expect(fabricated.gateReason).toBe("citation_validation_failed");

  const injection = byId(report, "answer-prompt-injection-in-evidence");
  expect(injection.injection.detected).toBe(true);
  expect(injection.injection.evidenceContainsRedaction).toBe(true);
  expect(injection.injection.rawInstructionAbsent).toBe(true);
}

function expectStructuralInvariants(report: EvalReport) {
  expectUnitInterval(report.metrics.retrieval.mrr);
  expectUnitInterval(report.metrics.retrieval.citationPrecision);
  expectUnitInterval(report.metrics.citations.retrievalPrecision);
  expectUnitInterval(report.metrics.citations.deliveredPrecision);
  expectUnitInterval(report.metrics.citations.candidatePrecision);
  expectUnitInterval(report.metrics.citations.coverage);
  expectUnitInterval(report.metrics.faithfulness.factCoverage);
  expectUnitInterval(report.metrics.faithfulness.supportedFactRate);
  expectUnitInterval(report.metrics.routes.accuracy);
  for (const value of Object.values(report.metrics.retrieval.recallAtK)) {
    expectUnitInterval(value);
  }
}

describe("RAG golden evaluation", () => {
  beforeEach(() => {
    fake().clear();
    pubmed.liveSearchAndIngest.mockClear();
    llmMock.generateJSON.mockClear();
  });

  it("compares weighted baseline against RRF hybrid on the same cases", async () => {
    const dataset = loadGoldenDataset();
    expect(validateDataset(dataset)).toEqual([]);

    const { baseline, hybrid, comparison } = await runRagEvalComparison(
      dataset,
      { db: dbHolder.mock.db },
    );

    expect(baseline.config.fusion).toBe("weighted");
    expect(hybrid.config.fusion).toBe("rrf");
    expect(baseline.config.networkCalls).toBe(false);
    expect(hybrid.config.networkCalls).toBe(false);

    expect(baseline.dataset.version).toBe(dataset.version);
    expect(hybrid.dataset.version).toBe(dataset.version);
    expect(baseline.cases).toHaveLength(dataset.cases.length);
    expect(hybrid.cases).toHaveLength(dataset.cases.length);

    expectStructuralInvariants(baseline);
    expectStructuralInvariants(hybrid);
    expectSafetyInvariants(baseline);
    expectSafetyInvariants(hybrid);

    // The comparison must cover every case and every reported metric.
    expect(comparison.cases).toHaveLength(dataset.cases.length);
    expect(comparison.rows.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        "recall@1",
        "recall@3",
        "mrr",
        "retrieval-citation-precision",
        "citation-coverage",
        "route-accuracy",
        "latency-mean",
        "mean-retrieved-candidates",
      ]),
    );

    // Safety-critical route outcomes must not regress under RRF.
    for (const testCase of hybrid.cases) {
      if (testCase.expectedBehavior === "emergency") {
        expect(testCase.actualBehavior).toBe("emergency");
      }
      if (testCase.expectedAbstainReason) {
        expect(testCase.actualBehavior).toBe("abstain");
      }
    }

    console.log(
      JSON.stringify(
        {
          dataset: hybrid.dataset,
          baseline: {
            fusion: baseline.config.fusion,
            metrics: baseline.metrics,
          },
          hybrid: {
            fusion: hybrid.config.fusion,
            metrics: hybrid.metrics,
          },
          comparison: comparison.rows.map((row) => ({
            metric: row.key,
            baseline: row.baseline,
            hybrid: row.hybrid,
            delta: row.delta,
            outcome:
              row.delta === null
                ? "n/a"
                : row.betterWhen === "neutral"
                  ? "context"
                  : row.delta === 0
                    ? "unchanged"
                    : row.delta > 0
                      ? "up"
                      : "down",
          })),
        },
        null,
        2,
      ),
    );
  });
});
