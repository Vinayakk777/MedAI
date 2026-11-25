import { describe, expect, it } from "vitest";
import {
  buildHighRiskPrefix,
  buildInsufficientInfoResponse,
  classifyQueryRisk,
} from "../../src/lib/safety/queryClassifier";

describe("classifyQueryRisk", () => {
  it("treats an empty question as low risk without short-circuiting", () => {
    const result = classifyQueryRisk("");
    expect(result.riskLevel).toBe("low");
    expect(result.shouldShortCircuit).toBe(false);
    expect(result.matchedPatterns).toEqual([]);
  });

  it("treats a normal factual question as low risk", () => {
    const result = classifyQueryRisk("What is a normal resting heart rate?");
    expect(result.riskLevel).toBe("low");
    expect(result.shouldShortCircuit).toBe(false);
  });

  it("short-circuits chest pain as an emergency", () => {
    const result = classifyQueryRisk("I am having crushing chest pain and cannot breathe");
    expect(result.riskLevel).toBe("emergency");
    expect(result.shouldShortCircuit).toBe(true);
    expect(result.shortCircuitMessage).toContain("emergency");
    expect(result.shortCircuitMessage).toMatch(/911|108/);
  });

  it("short-circuits suicidal ideation with crisis resources", () => {
    const result = classifyQueryRisk("I want to end my life");
    expect(result.riskLevel).toBe("emergency");
    expect(result.shouldShortCircuit).toBe(true);
    expect(result.shortCircuitMessage).toMatch(/988|emergency/);
  });

  it("flags medication questions as high risk without short-circuiting", () => {
    const result = classifyQueryRisk("What is the correct dosage of ibuprofen for an adult?");
    expect(result.riskLevel).toBe("high_risk");
    expect(result.shouldShortCircuit).toBe(false);
    expect(result.matchedPatterns).toContain("medication query");
  });

  it("flags pregnancy and pediatric questions as high risk", () => {
    expect(classifyQueryRisk("Is this safe during pregnancy?").riskLevel).toBe("high_risk");
    expect(classifyQueryRisk("My baby has a fever").riskLevel).toBe("high_risk");
  });

  it("detects requests for a self-diagnosis as insufficient information", () => {
    const result = classifyQueryRisk("What do I have?");
    expect(result.riskLevel).toBe("insufficient");
    expect(result.shouldShortCircuit).toBe(false);
    expect(result.reason).toBe("requesting self-diagnosis");
  });

  // Characterisation test: the lightweight classifier is deliberately
  // conservative and matches emergency terms anywhere in the query, including
  // question-form mentions. The response-level ClinicalSafetyValidator has the
  // finer-grained question exemption; see safety-validators.test.ts.
  it("conservatively short-circuits a question-form mention of a stroke", () => {
    const result = classifyQueryRisk("Could a headache be a sign of a stroke?");
    expect(result.riskLevel).toBe("emergency");
    expect(result.shouldShortCircuit).toBe(true);
  });
});

describe("safety prompt builders", () => {
  it("builds a high-risk prefix with uncertainty and consultation instructions", () => {
    const prefix = buildHighRiskPrefix();
    expect(prefix).toContain("[SAFETY INSTRUCTION]");
    expect(prefix).toContain("uncertainty language");
    expect(prefix).toContain("consulting a healthcare professional");
  });

  it("builds a clarifying response that asks for symptoms and duration", () => {
    const response = buildInsufficientInfoResponse("What do I have?");
    expect(response).toContain("more information");
    expect(response).toContain("Your main symptoms");
    expect(response).toContain("When it started");
    expect(response).toContain("healthcare professional");
  });
});
