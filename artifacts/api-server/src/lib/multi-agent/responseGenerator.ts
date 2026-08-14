import { AgentOutput, ConsensusDecision } from "./types";

export class ResponseGenerator {
  generate(
    agentOutputs: Map<string, AgentOutput>,
    consensus: ConsensusDecision[],
    originalMessage: string,
  ): string {
    const riskOutput = agentOutputs.get("risk_assessment");
    const diagnosisOutput = agentOutputs.get("differential_diagnosis");
    const followUpOutput = agentOutputs.get("follow_up");
    const selfCareOutput = agentOutputs.get("self_care_recovery");
    const medicationOutput = agentOutputs.get("medication_safety");
    const labOutput = agentOutputs.get("lab_recommendation");
    const evidenceOutput = agentOutputs.get("medical_evidence");

    const riskData = riskOutput?.status === "success" ? riskOutput.data : null;
    const diagnosisData = diagnosisOutput?.status === "success" ? diagnosisOutput.data : null;
    const followUpData = followUpOutput?.status === "success" ? followUpOutput.data : null;
    const escalationLevel = (riskData as any)?.escalationLevel;

    const sections: string[] = [];

    // Emergency override
    if (escalationLevel === "emergency") {
      const redFlags = (riskData as any)?.redFlags ?? [];
      const recommendedAction = (riskData as any)?.recommendedAction ?? "Seek emergency care immediately.";
      sections.push(`⚠️ **EMERGENCY WARNING**\n\n${recommendedAction}`);
      if (redFlags.length > 0) {
        sections.push(`**Red flags identified:**\n${redFlags.map((rf: any) => `- ${rf.flag}${rf.explanation ? `: ${rf.explanation}` : ""}`).join("\n")}`);
      }
      sections.push("This is an emergency. Do not wait. Call emergency services or go to the nearest emergency department.");
      return sections.join("\n\n");
    }

    // 1. Brief acknowledgement
    sections.push(this.buildAcknowledgement(originalMessage, diagnosisData));

    // 2. Possible conditions (if assessment complete)
    if (diagnosisData && escalationLevel !== "emergency") {
      const conditions = (diagnosisData as any)?.conditions ?? [];
      if (conditions.length > 0) {
        sections.push(this.buildConditionsSection(conditions));
      }
    }

    // 3. Risk assessment
    if (riskData && escalationLevel !== "routine") {
      sections.push(this.buildRiskSection(riskData));
    }

    // 4. Medication safety
    if (medicationOutput?.status === "success") {
      const medData = medicationOutput.data as any;
      if (medData.interactions?.length > 0 || medData.allergyConcerns?.length > 0) {
        sections.push(this.buildMedicationSection(medData));
      }
    }

    // 5. Lab recommendations
    if (labOutput?.status === "success" && escalationLevel !== "emergency") {
      const labData = labOutput.data as any;
      if ((labData.recommendedTests?.length ?? 0) > 0) {
        sections.push(this.buildLabSection(labData));
      }
    }

    // 6. Self-care recommendations
    if (selfCareOutput?.status === "success" && escalationLevel !== "emergency") {
      const scData = selfCareOutput.data as any;
      if ((scData.homeCareAdvice?.length ?? 0) > 0 || (scData.lifestyleRecommendations?.length ?? 0) > 0) {
        sections.push(this.buildSelfCareSection(scData));
      }
    }

    // 7. Follow-up questions
    if (followUpOutput?.status === "success") {
      const fuData = followUpData as any;
      if (!fuData?.canProceed && (fuData?.followUpQuestions?.length ?? 0) > 0) {
        sections.push(this.buildFollowUpSection(fuData));
      }
    }

    // 8. Evidence summary
    if (evidenceOutput?.status === "success") {
      const evData = evidenceOutput.data as any;
      if (evData.hasEvidence && evData.citations?.length > 0) {
        sections.push(this.buildEvidenceSection(evData));
      }
    }

    // 9. Medical disclaimer
    sections.push(this.buildDisclaimer());

    return sections.filter(Boolean).join("\n\n");
  }

  private buildAcknowledgement(msg: string, diagnosisData: any): string {
    const primarySymptom = diagnosisData?.conditions?.[0]?.name ?? "health concern";
    return `Thank you for sharing those details about your ${primarySymptom.toLowerCase()}. I understand you're concerned, and I'll do my best to provide helpful information.`;
  }

  private buildConditionsSection(conditions: any[]): string {
    const lines = conditions.slice(0, 5).map((c, i) => {
      const rank = i === 0 ? "Most likely" : i === 1 ? "Also possible" : "Less likely";
      return `${i + 1}. **${c.name}** (${rank})\n   - Confidence: ${c.confidence ?? "moderate"}\n   - Why: ${c.differentialRationale ?? c.typicalPresentation ?? ""}`;
    });
    return `**Possible Conditions**\n\n${lines.join("\n\n")}\n\n*These are possible explanations based on your symptoms. This is NOT a medical diagnosis.*`;
  }

  private buildRiskSection(riskData: any): string {
    const level = (riskData as any).escalationLevel;
    const score = (riskData as any).riskScore;
    const category = (riskData as any).riskCategory;
    const action = (riskData as any).recommendedAction;

    const emoji = level === "routine" ? "🟢" : level === "medical_review" ? "🟡" : level === "urgent_care" ? "🟠" : "🔴";
    return `**Health Risk Assessment**\n\n${emoji} Risk Level: ${category?.replace("_", " ") ?? "Unknown"} (${score ?? "N/A"}/100)\n- Recommended action: ${action ?? "Monitor at home."}\n- ${(riskData as any).summary ?? ""}`;
  }

  private buildMedicationSection(medData: any): string {
    const sections: string[] = ["**Medication Considerations**"];
    if (medData.interactions?.length > 0) {
      sections.push(`\nPotential interactions: ${medData.interactions.map((i: any) => `- ${i.description}`).join("\n")}`);
    }
    if (medData.allergyConcerns?.length > 0) {
      sections.push(`\nAllergy concerns: ${medData.allergyConcerns.map((a: any) => `- ${a.allergen}: ${a.recommendation}`).join("\n")}`);
    }
    sections.push("\n*Always consult a pharmacist or doctor before taking new medications.*");
    return sections.join("\n");
  }

  private buildLabSection(labData: any): string {
    const tests = (labData.recommendedTests ?? []).slice(0, 5);
    return `**Suggested Investigations**\n\n${tests.map((t: any) => `- **${t.testName}** (${t.priority}): ${t.clinicalReason}`).join("\n")}\n\n*These are suggestions only. Your doctor will determine which tests are appropriate.*`;
  }

  private buildSelfCareSection(scData: any): string {
    const sections: string[] = ["**Self-Care Recommendations**"];
    if (scData.homeCareAdvice?.length > 0) {
      sections.push(`\n${scData.homeCareAdvice.map((a: any) => `- **${a.category}**: ${a.advice}`).join("\n")}`);
    }
    if (scData.monitoringPlan?.length > 0) {
      sections.push(`\n**Monitoring Plan:**\n${scData.monitoringPlan.map((m: any) => `- ${m.item}: ${m.frequency} (seek help if ${m.threshold})`).join("\n")}`);
    }
    if (scData.warningSignals?.length > 0) {
      sections.push(`\n**Seek medical help if:**\n${scData.warningSignals.map((w: string) => `- ${w}`).join("\n")}`);
    }
    return sections.join("\n");
  }

  private buildFollowUpSection(fuData: any): string {
    return `**A Few More Questions**\n\n${(fuData.followUpQuestions ?? []).map((q: any) => `- ${q.question} (${q.reason})`).join("\n")}`;
  }

  private buildEvidenceSection(evData: any): string {
    const citations = (evData.citations ?? []).slice(0, 3);
    return `**Supporting Evidence**\n\nThis assessment is informed by medical knowledge sources including:\n${citations.map((c: any) => `- ${c.organization}${c.guidelineName ? ` (${c.guidelineName})` : ""} - ${c.confidence} confidence`).join("\n")}`;
  }

  private buildDisclaimer(): string {
    return "---\n\n*This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.*";
  }
}
