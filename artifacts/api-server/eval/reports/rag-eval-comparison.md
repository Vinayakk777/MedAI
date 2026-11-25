# MedAI Hybrid Retrieval Evaluation: Baseline vs RRF

- Dataset: **medai-rag-golden** v1.0.0
- Generated: 2026-11-25T12:39:46.986Z
- Cases: 12 | Documents: 12 | Chunks: 14
- Baseline: Weighted score fusion (0.7 semantic / 0.3 keyword)
- Hybrid: Reciprocal Rank Fusion
- Production default fusion: weighted (RRF is opt-in via `retrievalConfig.fusion = "rrf"`)
- RRF k: 60
- Candidate multiplier: 2 | Final top-K multiplier: 3

> Fixture comparison only. Semantic retrieval uses a deterministic bag-of-words embedding and keyword retrieval uses an in-memory tsquery proxy, so these deltas describe pipeline behavior on the golden dataset, not production model quality. Latency is local fixture timing. No production improvement is claimed.

## Metric comparison

| Metric | Baseline | Hybrid | Delta | Better when | Outcome |
| --- | --- | --- | --- | --- | --- |
| Retrieval Recall@1 | 0.857 | 0.857 | 0.000 | higher | unchanged |
| Retrieval Recall@3 | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Retrieval Recall@5 | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Retrieval MRR | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Retrieval citation precision | 0.762 | 0.143 | -0.619 | higher | worse |
| Delivered answer citation precision | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Citation coverage | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Route accuracy | 1.000 | 1.000 | 0.000 | higher | unchanged |
| Retrieval latency mean (ms, local fixture) | 15.168 | 8.569 | -6.60 | neutral | context only |
| Retrieval latency p95 (ms, local fixture) | 105.850 | 20.839 | -85.01 | neutral | context only |
| Mean retrieved candidates per answer case | 1.857 | 9.714 | +7.857 | neutral | context only |

> `Retrieval citation precision` is `relevant retrieved / all retrieved`, so it is **not** a like-for-like comparison when candidate-set sizes differ. Weighted fusion applies a `minCombinedScore` floor that collapses the candidate set to 1–3 chunks on this corpus, while RRF is rank-based and has no comparable score floor, so it returns the full over-fetched candidate pool. Use `Recall@K`, `MRR`, delivered citation precision and route accuracy for ranking quality; read the retrieval-precision row together with the mean candidate count.

## Per-case retrieval

| Case | Baseline retrieved | Hybrid retrieved | Baseline pass | Hybrid pass |
| --- | --- | --- | --- | --- |
| abstain-fabricated-citation | aha-heart-rate-1, example-sleep-1 | aha-heart-rate-1, example-sleep-1, cdc-exercise-1, who-hypertension-1, nih-sodium-1, acsm-exercise-1, example-asthma-1, example-diabetes-foot-1, example-headache-1, nhs-hydration-1 | yes | yes |
| abstain-individualized-medication | who-hypertension-med-1, who-hypertension-1 | who-hypertension-med-1, who-hypertension-1, nih-sodium-1, who-hypertension-2, cdc-exercise-1, example-asthma-1, example-diabetes-foot-1, example-sleep-1, aha-heart-rate-1, example-headache-1, nhs-hydration-1, niddk-diabetes-1, nih-sodium-2 | yes | yes |
| abstain-insufficient-evidence | (none) | (none) | yes | yes |
| abstain-unsupported-diagnosis | niddk-diabetes-1 | niddk-diabetes-1, acsm-exercise-1, example-asthma-1, example-diabetes-foot-1, nhs-hydration-1, nih-sodium-2, who-hypertension-2 | yes | yes |
| answer-blood-pressure-normal | who-hypertension-1 | who-hypertension-1, aha-heart-rate-1, cdc-exercise-1, example-sleep-1, nih-sodium-1, who-hypertension-2, who-hypertension-med-1, example-asthma-1, example-diabetes-foot-1, example-headache-1, nhs-hydration-1, niddk-diabetes-1, nih-sodium-2 | yes | yes |
| answer-hydration | nhs-hydration-1, cdc-exercise-1, nih-sodium-1 | nhs-hydration-1, cdc-exercise-1, nih-sodium-1, example-sleep-1, aha-heart-rate-1, example-asthma-1, example-diabetes-foot-1, who-hypertension-1, who-hypertension-med-1 | yes | yes |
| answer-moderate-exercise | cdc-exercise-1, acsm-exercise-1 | cdc-exercise-1, acsm-exercise-1, example-sleep-1, nhs-hydration-1, nih-sodium-1, aha-heart-rate-1, example-asthma-1, example-diabetes-foot-1, who-hypertension-1, who-hypertension-med-1 | yes | yes |
| answer-prompt-injection-in-evidence | example-headache-1 | example-headache-1, example-sleep-1, acsm-exercise-1, aha-heart-rate-1, nhs-hydration-1, niddk-diabetes-1, nih-sodium-2 | yes | yes |
| answer-resting-heart-rate | aha-heart-rate-1, example-sleep-1 | aha-heart-rate-1, example-sleep-1, cdc-exercise-1, who-hypertension-1, nih-sodium-1, acsm-exercise-1, example-asthma-1, example-diabetes-foot-1, example-headache-1, nhs-hydration-1 | yes | yes |
| answer-sodium-limit | nih-sodium-1, nhs-hydration-1 | nih-sodium-1, nhs-hydration-1, cdc-exercise-1, example-sleep-1, aha-heart-rate-1, who-hypertension-1, acsm-exercise-1, example-asthma-1, example-diabetes-foot-1, nih-sodium-2, who-hypertension-2, who-hypertension-med-1 | yes | yes |
| conflicting-exercise-guidance | acsm-exercise-1, cdc-exercise-1 | acsm-exercise-1, cdc-exercise-1, nhs-hydration-1, aha-heart-rate-1, example-sleep-1, nih-sodium-1, who-hypertension-1 | yes | yes |
| emergency-chest-pain | (none) | (none) | yes | yes |

## Interpretation

Deltas are computed as hybrid minus baseline. A positive delta is better for recall, MRR, precision, coverage and route accuracy. Latency and candidate-count rows are context only: the fixture is too small for a meaningful timing comparison, and candidate-set size differs by design between the two fusion modes. This report does not claim production improvement: both runs use the same deterministic fixtures and the same golden cases, and the corpus is intentionally small.
