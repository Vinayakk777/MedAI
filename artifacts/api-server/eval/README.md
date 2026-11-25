# MedAI RAG Golden Evaluation

Offline, deterministic evaluation of MedAI's retrieval, citation validation, and
safe-delivery pipeline.

> **Synthetic data only.** The dataset contains no real patient records and is
> not clinical guidance. Organizations, identifiers, and URLs are fictional
> fixtures under `example.org`.

## Quick start

```bash
pnpm run eval:rag
```

This runs the evaluation only. It is intentionally separate from `pnpm test`
and is not part of the runtime application.

Generated reports are written to:

- `artifacts/api-server/eval/reports/rag-eval-report.json`
- `artifacts/api-server/eval/reports/rag-eval-report.md`

## What is exercised

The evaluation runs the **production** pipeline:

```
classifyQueryRisk
  -> RagEngine.formatEvidenceForPrompt
       -> QueryRewriter        (production fallback)
       -> MedAIHybridRetriever (LangChain BaseRetriever adapter)
            -> HybridSearchEngine   (vector + keyword branches, weighted/RRF fusion)
       -> MedAIReRankCompressor (LangChain BaseDocumentCompressor adapter)
            -> LLMReRanker          (production fallback)
       -> ContextSelector
       -> CitationEngine
  -> sanitizeUntrustedEvidence / wrapUntrustedEvidence
  -> applyResponseGate         (deterministic citation / diagnosis / medication checks)
  -> validateCitations         (delivered-text re-validation)
```

External dependencies are replaced with fixtures, so the run makes **no network
calls, database connections, or provider requests**:

| Dependency | Fixture |
| --- | --- |
| `@workspace/db` | In-memory fake Drizzle layer (`test/helpers/workspaceDbMock.ts`) |
| `drizzle-orm` | Predicate helpers (`test/helpers/drizzleMock.ts`) |
| Embeddings | Deterministic bag-of-words embedder with a fixed vocabulary |
| Vector store | In-memory cosine-similarity store |
| PostgreSQL full-text search | In-memory `tsquery` proxy |
| Live PubMed ingestion | No-op |
| LLM query rewrite / rerank | Returns no data, forcing production fallbacks |
| Answer generation | Golden fixture answers |
| LLM safety framework | Deterministic `allow` evaluation; the LLM safety framework is covered by unit tests |

`applyResponseGate` still runs its real deterministic checks, so the citation,
diagnosis, and medication behaviors measured here are the production ones.

## Dataset

- **Name:** `medai-rag-golden`
- **Version:** `1.0.0`
- **Created:** 2026-11-23
- **Location:** `artifacts/api-server/eval/golden/rag-golden.v1.json`
- **Size:** 12 cases, 12 documents, 14 chunks

Each case declares:

- a stable `id`
- a medical `question`
- `relevantChunkIds` (labeled evidence)
- `keyFacts` (for answer cases)
- `expectedCitationIds` (identifiers expected in the delivered text)
- `expectedBehavior`: `answer`, `abstain`, or `emergency`
- `abstainReason` for abstain cases
- a `fixtureAnswer` and the evidence chunks backing it
- tags used for coverage checks

### Coverage

| Category | Cases |
| --- | --- |
| Directly answerable | `answer-blood-pressure-normal`, `answer-resting-heart-rate`, `answer-moderate-exercise`, `answer-sodium-limit`, `answer-hydration` |
| Conflicting evidence | `conflicting-exercise-guidance` |
| Insufficient evidence | `abstain-insufficient-evidence` |
| Emergency | `emergency-chest-pain` |
| Unsupported diagnosis | `abstain-unsupported-diagnosis` |
| Individualized medication advice | `abstain-individualized-medication` |
| Fabricated citation | `abstain-fabricated-citation` |
| Prompt injection in evidence | `answer-prompt-injection-in-evidence` |

## Configuration

| Setting | Value |
| --- | --- |
| `topK` | 10 |
| `recallK` | 1, 3, 5 |
| `pipelineStage` | `general` |
| Production default fusion | weighted score fusion, 0.7 semantic / 0.3 keyword, `minCombinedScore` 0.25 |
| Opt-in fusion | Reciprocal Rank Fusion (`fusion: "rrf"`), `k` 60, semantic weight 1, keyword weight 1 |
| Candidate multiplier | 2 (each branch over-fetches `topK × 2`) |
| Final top-K multiplier | 3 (RAG engine requests `topK × 3` for the reranker) |
| Embedding | `deterministic-bag-of-words-v1` |
| Vector store | in-memory fixture |
| Keyword search | in-memory `tsquery` proxy |
| Query rewrite | production fallback (LLM fixture returns `null`) |
| Reranker | production fallback (LLM fixture returns `null`) |
| Answer generation | golden fixture answers |
| Safety | deterministic `allow`; deterministic delivery gate |
| Network calls | none |

## Metric definitions

### Retrieval metrics

Computed over **answer cases with labeled relevant chunks** (7 cases).

- **Recall@K** — fraction of labeled relevant chunks that appear in the top `K`
  retrieved chunks. Averaged across cases.
- **MRR (mean reciprocal rank)** — reciprocal rank of the first relevant chunk,
  averaged across cases. `0` if no relevant chunk is retrieved.
- **Retrieval citation precision** — fraction of retrieved chunks that are
  labeled relevant, averaged across cases. This measures retrieval precision,
  not whether the delivered answer cites correctly.

### Citation metrics

- **Delivered answer citation precision** — fraction of identifier references in
  the **delivered** text that resolve to retrieved evidence. Uses the production
  `validateCitations` result (`unverified_citation_identifier` issues).
- **Candidate citation precision (pre-gate)** — the same calculation on the
  candidate answer before the gate. A lower value here than the delivered value
  shows the gate removing an invalid citation.
- **Citation coverage** — fraction of answer cases whose delivered text contains
  at least one expected citation identifier.

### Faithfulness proxy

Computed over answer cases.

- **Fact coverage** — fraction of expected `keyFacts` present verbatim in the
  delivered answer.
- **Supported fact rate** — fraction of those present facts that are lexically
  supported by retrieved evidence (exact substring, or ≥80% token overlap).

This is a deterministic, inspectable **lexical support proxy**, not entailment
and not a substitute for human review.

### Route outcomes

- **Route accuracy** — fraction of cases where the delivered behavior
  (`answer` / `abstain` / `emergency`) matches the expected behavior.
- Per-behavior counts are reported for expected and actual outcomes.
- Abstain cases are additionally checked against their expected reason
  (`insufficient_evidence`, `unsafe_advice`, or `invalid_citation`).

## Results (dataset v1.0.0)

Measured by `pnpm run eval:rag` on 2026-11-23. The command runs the same 12
cases twice — once with the production-default weighted fusion and once with the
opt-in RRF mode — and writes `rag-eval-baseline.*`, `rag-eval-report.*` and
`rag-eval-comparison.*` to `artifacts/api-server/eval/reports/`. These are
fixture results, not production model performance.

### Baseline vs RRF

| Metric | Weighted baseline | RRF hybrid | Delta |
| --- | --- | --- | --- |
| Retrieval Recall@1 | 0.857 | 0.857 | 0.000 |
| Retrieval Recall@3 | 1.000 | 1.000 | 0.000 |
| Retrieval Recall@5 | 1.000 | 1.000 | 0.000 |
| Retrieval MRR | 1.000 | 1.000 | 0.000 |
| Retrieval citation precision | 0.762 | 0.143 | −0.619 |
| Delivered answer citation precision | 1.000 | 1.000 | 0.000 |
| Citation coverage | 1.000 | 1.000 | 0.000 |
| Route accuracy | 1.000 (12/12) | 1.000 (12/12) | 0.000 |
| Mean retrieved candidates (answer cases) | 1.86 | 9.71 | +7.86 |
| Retrieval latency mean (local fixture) | varies, ~10–15 ms | varies, ~6–8 ms | not comparable |
| Retrieval latency p95 (local fixture) | varies, ~70–130 ms | varies, ~15–21 ms | not comparable |

Route outcomes are identical in both runs:

| Expected | Cases | Correct | Actual answer | Actual abstain | Actual emergency |
| --- | --- | --- | --- | --- | --- |
| answer | 7 | 7 | 7 | 0 | 0 |
| abstain | 4 | 4 | 0 | 4 | 0 |
| emergency | 1 | 1 | 0 | 0 | 1 |

**What the numbers show.** On this dataset, RRF did not change any measured
ranking or delivery outcome: Recall@1/3/5, MRR, delivered citation precision,
citation coverage and route accuracy are identical. RRF did increase the
candidate set returned to the reranker (1.86 → 9.71 chunks per answer case) and
therefore lowered **retrieval-set** citation precision.

That precision drop is a candidate-count effect, not a ranking regression:
`retrieval citation precision = relevant retrieved / all retrieved`, and
weighted fusion's `minCombinedScore = 0.25` floor collapses the pool to 1–3
chunks, while RRF is rank-based and has no comparable score floor. Compare the
retrieval-precision row together with the candidate-count row; Recall@K and MRR
are the like-for-like ranking measures. The downstream selector and delivery gate
keep delivered citation precision at 1.000 in both runs.

The latency difference is **not** attributable to the fusion strategy. Both runs
issue the same number of vector and keyword calls, and the baseline pass runs
first, so it absorbs most of the JIT/warm-up cost. The fixture is also too small
for a meaningful timing comparison, and the values vary noticeably between runs.
Treat both latency rows as local fixture timing only.

No production improvement is claimed. Because the fixture shows no measured gain
from RRF, the production default is weighted score fusion — the previously
shipped behavior. RRF remains available as an explicit opt-in and is still
measured here so the trade-off is visible.

### Selecting a fusion mode

```ts
// Default: weighted score fusion (0.7 semantic / 0.3 keyword).
new RagEngine();

// Opt-in: Reciprocal Rank Fusion.
new RagEngine({ retrievalConfig: { fusion: "rrf" } });
```

Both modes use the same semantic and keyword branches, metadata filters,
citation assembly and delivery gate; only the fusion of the two ranked lists
changes.

### Failed cases

None of the 12 cases failed the configured checks in either run.

The one pre-gate citation defect is the intentional `abstain-fabricated-citation`
case: its candidate cites `PMC9999999`, which is not in the retrieved evidence.
The gate rejects it with `citation_validation_failed` and delivers the safe
fallback, so delivered citation precision is 1.000 while candidate precision is
0.980.

Recall@1 is 0.857 because one answer case ranks a distractor above its relevant
chunk. This is unchanged by RRF and is not a delivery failure.

## Tests

Metric calculations and dataset validation have unit tests:

- `artifacts/api-server/test/unit/rag-eval-metrics.test.ts`
- `artifacts/api-server/test/unit/rag-eval-dataset.test.ts`

Hybrid retrieval has focused unit tests covering RRF ordering, deduplication,
metadata preservation, per-branch failure fallback, filter parameterization and
configuration clamping:

- `artifacts/api-server/test/unit/rag-hybrid-retrieval.test.ts`

Run them with the normal suite:

```bash
pnpm test
```

The evaluation itself runs with:

```bash
pnpm run eval:rag
```

## Limitations

- **Synthetic corpus.** 12 cases cannot represent clinical breadth, rare
  conditions, or real patient phrasing.
- **Fixture embeddings.** The bag-of-words embedder is deterministic and cheap,
  but it does not behave like production embeddings. Retrieval metrics here are
  a pipeline sanity check, not a model quality estimate.
- **Keyword-search proxy.** The in-memory `tsquery` stand-in approximates
  PostgreSQL full-text ranking; it is not the real search engine.
- **Fallback paths.** Query rewriting and LLM reranking use production fallback
  behavior because the LLM fixture returns no data, so LLM-assisted retrieval
  quality is not measured.
- **Fixture answers.** Answer generation is not a live model; answer quality
  beyond key-fact presence and lexical support is not evaluated.
- **Lexical faithfulness.** The proxy can be fooled by paraphrase and by
  copying evidence without reasoning; it is not entailment.
- **Safety scope.** The LLM-based `SafetyFramework` is not invoked in this run.
  Only the deterministic delivery gate is exercised.
- **Single configuration.** Results are for `topK = 10` and `pipelineStage =
  general`; other stages and thresholds are untested here.
- **Fusion comparison is fixture-bound.** Both fusion modes run over the same
  tiny synthetic corpus with a deterministic embedder and an in-memory keyword
  proxy. The comparison shows pipeline behavior, not production retrieval
  quality, and does not establish that RRF is better. For that reason weighted
  fusion remains the production default and RRF is opt-in.
- **Candidate-count confound.** Weighted fusion's score floor and RRF's
  rank-based scoring produce different candidate-set sizes, so the retrieval
  citation precision values are not directly comparable. See the Results section.
- **Latency is not a fusion benchmark.** Timing comes from a small in-memory
  fixture with warm-up effects; it is not production latency and does not show
  that one fusion mode is faster.

## Adding cases

1. Add synthetic documents and chunks with fictional identifiers
   (`PMC90000xx`, `https://example.org/...`).
2. Add a case with `relevantChunkIds`, `keyFacts`, `expectedCitationIds`,
   `expectedBehavior`, and fixture answer evidence.
3. Bump `version` when the dataset changes materially.
4. Run `pnpm run eval:rag` and `pnpm test`.

Dataset validation enforces unique IDs, valid references, synthetic disclaimer,
required coverage tags, and consistency between expected behavior and labels.
