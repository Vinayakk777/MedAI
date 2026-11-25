import { describe, expect, it } from "vitest";
import {
  answerCitationPrecision,
  citationCoverage,
  faithfulnessProxy,
  isFactSupported,
  mean,
  meanBoolean,
  recallAtK,
  reciprocalRank,
  retrievalCitationPrecision,
  routeMatches,
} from "../../eval/lib/metrics";

describe("RAG evaluation retrieval metrics", () => {
  it("computes Recall@K over labeled relevant chunks", () => {
    const retrieved = ["a", "b", "c"];
    const relevant = ["b", "d"];

    expect(recallAtK(retrieved, relevant, 1)).toBe(0);
    expect(recallAtK(retrieved, relevant, 2)).toBe(0.5);
    expect(recallAtK(retrieved, relevant, 3)).toBe(0.5);
    expect(recallAtK(retrieved, relevant, 0)).toBe(0);
  });

  it("returns null for Recall@K when no chunks are labeled relevant", () => {
    expect(recallAtK(["a"], [], 3)).toBeNull();
  });

  it("computes reciprocal rank of the first relevant chunk", () => {
    expect(reciprocalRank(["x", "b", "a"], ["a", "b"])).toBe(0.5);
    expect(reciprocalRank(["a", "b"], ["a"])).toBe(1);
    expect(reciprocalRank(["x", "y"], ["a"])).toBe(0);
    expect(reciprocalRank([], ["a"])).toBe(0);
  });

  it("returns null for MRR when no chunks are labeled relevant", () => {
    expect(reciprocalRank(["a"], [])).toBeNull();
  });

  it("computes retrieval citation precision", () => {
    expect(retrievalCitationPrecision(["a", "x", "b"], ["a", "b"])).toBeCloseTo(
      2 / 3,
    );
    expect(retrievalCitationPrecision(["a"], ["a"])).toBe(1);
    expect(retrievalCitationPrecision(["x"], ["a"])).toBe(0);
    expect(retrievalCitationPrecision([], ["a"])).toBeNull();
  });
});

describe("RAG evaluation citation metrics", () => {
  it("checks citation coverage using normalized identifiers", () => {
    expect(
      citationCoverage("See PMCID: PMC9000001 for details.", ["PMC9000001"]),
    ).toBe(true);
    expect(
      citationCoverage("See (PMID: 34567890).", ["PMID:34567890"]),
    ).toBe(true);
    expect(
      citationCoverage(
        "See https://example.org/guide.",
        ["https://example.org/guide"],
      ),
    ).toBe(true);
    expect(citationCoverage("No identifiers here.", ["PMC9000001"])).toBe(
      false,
    );
    expect(citationCoverage("No identifiers here.", [])).toBeNull();
  });

  it("computes answer-level citation precision", () => {
    expect(answerCitationPrecision(4, 1)).toBe(0.75);
    expect(answerCitationPrecision(3, 0)).toBe(1);
    expect(answerCitationPrecision(0, 0)).toBeNull();
    expect(answerCitationPrecision(1, 2)).toBe(0);
  });
});

describe("RAG evaluation faithfulness proxy", () => {
  const evidence = [
    "A normal resting heart rate for adults is usually between 60 and 100 beats per minute.",
  ];

  it("counts facts present in the answer", () => {
    const result = faithfulnessProxy(
      "A normal resting heart rate is between 60 and 100 beats per minute.",
      ["60 and 100 beats per minute", "a lower rate in athletes"],
      evidence,
    );

    expect(result.factCoverage).toBe(0.5);
    expect(result.missingFacts).toEqual(["a lower rate in athletes"]);
  });

  it("distinguishes supported from unsupported facts", () => {
    const result = faithfulnessProxy(
      "A normal resting heart rate is between 60 and 100 beats per minute. It is caused by caffeine deficiency.",
      ["60 and 100 beats per minute", "caused by caffeine deficiency"],
      evidence,
    );

    expect(result.factCoverage).toBe(1);
    expect(result.supportedFactRate).toBe(0.5);
    expect(result.supportedFacts).toEqual(["60 and 100 beats per minute"]);
    expect(result.unsupportedFacts).toEqual([
      "caused by caffeine deficiency",
    ]);
  });

  it("returns null metrics when no key facts are defined", () => {
    const result = faithfulnessProxy("anything", [], evidence);

    expect(result.factCoverage).toBeNull();
    expect(result.supportedFactRate).toBeNull();
  });

  it("supports facts by token overlap as well as exact substring", () => {
    expect(
      isFactSupported(
        "60 to 100 beats per minute",
        "normal resting heart rate is between 60 and 100 beats per minute",
      ),
    ).toBe(true);
    expect(
      isFactSupported("a rare genetic cause", "rest and hydration may help"),
    ).toBe(false);
  });
});

describe("RAG evaluation aggregation helpers", () => {
  it("averages only numeric values and ignores nulls", () => {
    expect(mean([1, 0.5, null, undefined, 0])).toBe(0.5);
    expect(mean([null, undefined])).toBeNull();
    expect(mean([])).toBeNull();
  });

  it("averages booleans as 1/0 while ignoring nulls", () => {
    expect(meanBoolean([true, false, null, true])).toBeCloseTo(2 / 3);
    expect(meanBoolean([null])).toBeNull();
  });

  it("compares route outcomes exactly", () => {
    expect(routeMatches("answer", "answer")).toBe(true);
    expect(routeMatches("abstain", "answer")).toBe(false);
    expect(routeMatches("emergency", "emergency")).toBe(true);
  });
});
