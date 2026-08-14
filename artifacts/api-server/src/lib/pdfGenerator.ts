import PDFDocument from "pdfkit";
import type { MedicalReport } from "./reportEngine";

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const PRIMARY = "#0f766e";        // deep teal
const ACCENT = "#14b8a6";         // teal accent
const INK = "#1e293b";            // body text
const MUTED = "#64748b";          // labels
const FAINT = "#94a3b8";
const BORDER = "#cbd5e1";
const BORDER_SOFT = "#e2e8f0";
const PANEL = "#f8fafc";
const SEVERE = "#b91c1c";
const MODERATE = "#b45309";

function severityColor(confidence: number): string {
  if (confidence >= 70) return "#15803d";
  if (confidence >= 40) return "#b45309";
  return "#b91c1c";
}

function fmtDate(d?: string, withTime = false): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function drawMasthead(doc: typeof PDFDocument.prototype, report: MedicalReport) {
  // Hospital identity
  doc.font("Helvetica-Bold").fontSize(16).fillColor(PRIMARY).text("MedAI Multi-Specialty Clinic", PAGE_MARGIN, 40);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Accredited Consultative & Diagnostic Centre", PAGE_MARGIN, 60);

  // Report title (right-aligned)
  const title = "Consultation Report";
  const titleW = doc.font("Helvetica-Bold").fontSize(13).widthOfString(title);
  doc.text(title, PAGE_WIDTH - PAGE_MARGIN - titleW, 42, { align: "right", width: titleW });
  const ver = `Version ${report.version}`;
  const verW = doc.font("Helvetica").fontSize(8).widthOfString(ver);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(ver, PAGE_WIDTH - PAGE_MARGIN - verW, 60, { align: "right", width: verW });

  // Accent double rule
  doc.moveTo(PAGE_MARGIN, 76).lineTo(PAGE_WIDTH - PAGE_MARGIN, 76).lineWidth(2).strokeColor(PRIMARY).stroke();
  doc.moveTo(PAGE_MARGIN, 79).lineTo(PAGE_WIDTH - PAGE_MARGIN, 79).lineWidth(0.5).strokeColor(BORDER).stroke();

  // Meta strip
  const metaTop = 88;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text("Report No:", PAGE_MARGIN, metaTop);
  doc.font("Helvetica").fillColor(MUTED).text(report.reportId?.slice(0, 8).toUpperCase() ?? "—", PAGE_MARGIN + 52, metaTop);
  doc.font("Helvetica-Bold").fillColor(INK).text("Visit Date:", PAGE_MARGIN + 130, metaTop);
  doc.font("Helvetica").fillColor(MUTED).text(fmtDate(report.consultationDate), PAGE_MARGIN + 185, metaTop);
  doc.font("Helvetica-Bold").fillColor(INK).text("Generated:", PAGE_MARGIN + 300, metaTop);
  doc.font("Helvetica").fillColor(MUTED).text(fmtDate(report.generatedAt, true), PAGE_MARGIN + 355, metaTop);

  doc.moveTo(PAGE_MARGIN, 100).lineTo(PAGE_WIDTH - PAGE_MARGIN, 100).lineWidth(0.5).strokeColor(BORDER_SOFT).stroke();
  doc.y = 108;
}

function drawSectionTitle(doc: typeof PDFDocument.prototype, title: string) {
  if (doc.y > 690) { doc.addPage(); doc.y = 50; }
  if (doc.y < 108) doc.y = 108;
  doc.moveDown(0.15);
  doc.fillColor(PRIMARY).rect(PAGE_MARGIN, doc.y + 1, 3, 11).fill();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(title, PAGE_MARGIN + 8, doc.y);
  doc.y += 13;
  doc.fillColor(BORDER_SOFT).rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 0.7).fill();
  doc.y += 8;
}

function drawField(doc: typeof PDFDocument.prototype, label: string, value: string) {
  if (doc.y > 700) { doc.addPage(); doc.y = 50; }
  const valueHeight = doc.font("Helvetica").fontSize(9).heightOfString(value, { width: CONTENT_WIDTH - 95 });
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(label, PAGE_MARGIN, doc.y + 1);
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(value, PAGE_MARGIN + 95, doc.y, { width: CONTENT_WIDTH - 95 });
  if (valueHeight < 11) doc.y += 3;
}

function drawList(doc: typeof PDFDocument.prototype, items: string[], width = CONTENT_WIDTH) {
  items.forEach((item) => {
    if (doc.y > 700) { doc.addPage(); doc.y = 50; }
    const top = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(item, PAGE_MARGIN + 12, doc.y, { width: width - 20 });
    doc.fillColor(PRIMARY).text("•", PAGE_MARGIN, top);
    doc.moveDown(0.35);
  });
}

function drawTable(doc: typeof PDFDocument.prototype, headers: string[], rows: string[][], widths: number[], bodyFontSize = 8.5) {
  if (doc.y > 660) { doc.addPage(); doc.y = 50; }
  const colX = [PAGE_MARGIN];
  for (let i = 0; i < widths.length; i++) colX.push(colX[i] + widths[i]);

  const rowHeights = rows.map((row) =>
    Math.max(
      15,
      ...row.map((cell, ci) =>
        doc.font("Helvetica").fontSize(bodyFontSize).heightOfString(String(cell ?? ""), { width: widths[ci] - 8 }) + 5,
      ),
    ),
  );

  const headerTop = doc.y;
  doc.fillColor(PRIMARY).rect(PAGE_MARGIN, headerTop, CONTENT_WIDTH, 16).fill();
  headers.forEach((h, i) => {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff").text(h, colX[i] + 5, headerTop + 4.5, { width: widths[i] - 8 });
  });

  let y = headerTop + 16;
  rows.forEach((row, ri) => {
    if (y > 690) { doc.addPage(); y = 50; }
    const rowH = rowHeights[ri];
    doc.fillColor(ri % 2 === 0 ? PANEL : "#ffffff").rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowH).fill();
    row.forEach((cell, ci) => {
      doc.font("Helvetica").fontSize(bodyFontSize).fillColor(INK)
        .text(String(cell ?? ""), colX[ci] + 5, y + 2.5, { width: widths[ci] - 8, height: rowH - 4 });
    });
    y += rowH;
  });

  // grid lines
  const lineTop = y;
  doc.moveTo(PAGE_MARGIN, headerTop).lineTo(PAGE_WIDTH - PAGE_MARGIN, headerTop).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.moveTo(PAGE_MARGIN, lineTop).lineTo(PAGE_WIDTH - PAGE_MARGIN, lineTop).lineWidth(0.5).strokeColor(BORDER).stroke();
  for (let i = 0; i <= widths.length; i++) {
    doc.moveTo(colX[i], headerTop).lineTo(colX[i], lineTop).lineWidth(0.5).strokeColor(BORDER).stroke();
  }
  doc.y = lineTop + 8;
}

function drawPatientPanel(doc: typeof PDFDocument.prototype, report: MedicalReport) {
  const pi = report.patientInfo;
  const gridTop = doc.y;
  const colW = CONTENT_WIDTH / 4;
  const rowH = 22;

  const rows: Array<Array<{ label: string; value: string } | null>> = [
    [
      { label: "Patient", value: pi.name || "Patient" },
      { label: "Age", value: pi.age ? `${pi.age} yrs` : "—" },
      { label: "Sex", value: pi.sex || "—" },
      { label: "Patient ID", value: report.reportId?.slice(0, 8).toUpperCase() || "—" },
    ],
    [
      { label: "Height", value: pi.height || "—" },
      { label: "Weight", value: pi.weight || "—" },
      { label: "BMI", value: pi.bmi || "—" },
      null,
    ],
  ];

  let extraRows = 0;
  if (pi.existingConditions?.length) extraRows++;
  if (pi.allergies?.length) extraRows++;

  const panelH = 16 + rows.length * rowH + extraRows * rowH;

  // dark header
  doc.fillColor(PRIMARY).rect(PAGE_MARGIN, gridTop, CONTENT_WIDTH, 16).fill();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff").text("PATIENT INFORMATION", PAGE_MARGIN + 6, gridTop + 5);

  // panel background
  let y = gridTop + 16;
  doc.fillColor(PANEL).rect(PAGE_MARGIN, y, CONTENT_WIDTH, panelH - 16).fill();

  rows.forEach((row) => {
    row.forEach((cell, ci) => {
      if (!cell) return;
      const x = PAGE_MARGIN + ci * colW + 6;
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(FAINT).text(cell.label.toUpperCase(), x, y + 2, { width: colW - 10 });
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(cell.value, x, y + 10, { width: colW - 10 });
    });
    y += rowH;
  });

  if (pi.existingConditions?.length) {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(FAINT).text("KNOWN CONDITIONS".toUpperCase(), PAGE_MARGIN + 6, y + 2, { width: CONTENT_WIDTH - 12 });
    doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(pi.existingConditions.join(", "), PAGE_MARGIN + 6, y + 10, { width: CONTENT_WIDTH - 12 });
    y += rowH;
  }
  if (pi.allergies?.length) {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(FAINT).text("ALLERGIES".toUpperCase(), PAGE_MARGIN + 6, y + 2, { width: CONTENT_WIDTH - 12 });
    doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(pi.allergies.join(", "), PAGE_MARGIN + 6, y + 10, { width: CONTENT_WIDTH - 12 });
    y += rowH;
  }

  // border around whole panel
  doc.moveTo(PAGE_MARGIN, gridTop).lineTo(PAGE_WIDTH - PAGE_MARGIN, gridTop).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.moveTo(PAGE_MARGIN, gridTop + panelH).lineTo(PAGE_WIDTH - PAGE_MARGIN, gridTop + panelH).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.y = gridTop + panelH + 10;
}

function drawDisclaimer(doc: typeof PDFDocument.prototype, text: string) {
  if (doc.y > 680) { doc.addPage(); doc.y = 60; }
  doc.y += 14;
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y).lineWidth(1).strokeColor("#fecaca").stroke();
  doc.y += 4;
  const textH = doc.font("Helvetica").fontSize(7.5).heightOfString(text, { width: CONTENT_WIDTH - 16 });
  doc.fillColor("#fff1f2").rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, textH + 22).fill();
  doc.fillColor("#be123c").font("Helvetica-Bold").fontSize(7.5).text("MEDICAL DISCLAIMER", PAGE_MARGIN + 8, doc.y + 6);
  doc.font("Helvetica").fontSize(7.5).fillColor("#9f1239").text(
    text,
    PAGE_MARGIN + 8, doc.y + 16,
    { width: CONTENT_WIDTH - 16 },
  );
  doc.y += 10;
}

export function generateConsultationPDF(report: MedicalReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 50, left: 50, right: 50 },
        info: { Title: `Consultation Report - ${report.consultationDate}`, Creator: "MedAI v2.0" },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawMasthead(doc, report);

      drawPatientPanel(doc, report);

      // Chief Complaint
      if (report.chiefComplaint) {
        drawSectionTitle(doc, "Chief Complaint");
        doc.font("Helvetica").fontSize(9).fillColor(INK).text(report.chiefComplaint, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.4);
      }

      // History of Present Illness
      const hpi = report.historyOfPresentIllness;
      const hpiRows: Array<[string, string]> = [];
      if (hpi.duration) hpiRows.push(["Duration:", hpi.duration]);
      if (hpi.severity) hpiRows.push(["Severity:", hpi.severity]);
      if (hpi.associatedSymptoms?.length) hpiRows.push(["Associated:", hpi.associatedSymptoms.join(", ")]);
      if (hpi.aggravatingFactors?.length) hpiRows.push(["Aggravating:", hpi.aggravatingFactors.join(", ")]);
      if (hpi.relievingFactors?.length) hpiRows.push(["Relieving:", hpi.relievingFactors.join(", ")]);
      if (hpi.symptomTimeline) hpiRows.push(["Timeline:", hpi.symptomTimeline]);

      if (hpiRows.length > 0 || hpi.symptomTimeline) {
        drawSectionTitle(doc, "History of Present Illness");
        hpi.duration && drawField(doc, "Duration:", hpi.duration);
        hpi.severity && drawField(doc, "Severity:", hpi.severity);
        hpi.associatedSymptoms?.length > 0 && drawField(doc, "Associated:", hpi.associatedSymptoms.join(", "));
        hpi.aggravatingFactors?.length > 0 && drawField(doc, "Aggravating:", hpi.aggravatingFactors.join(", "));
        hpi.relievingFactors?.length > 0 && drawField(doc, "Relieving:", hpi.relievingFactors.join(", "));
        hpi.symptomTimeline && drawField(doc, "Timeline:", hpi.symptomTimeline);
        doc.moveDown(0.3);
      }

      // Recorded Symptoms
      if (report.extractedSymptoms.length > 0) {
        drawSectionTitle(doc, "Recorded Symptoms");
        drawTable(doc,
          ["Symptom", "Severity", "Duration"],
          report.extractedSymptoms.map(s => [s.symptom, s.severity, s.duration || "—"]),
          [240, 120, 135],
        );
        doc.moveDown(0.3);
      }

      // Differential Diagnosis
      if (report.differentialDiagnoses.length > 0) {
        drawSectionTitle(doc, "Differential Diagnosis");
        report.differentialDiagnoses.forEach((d, i) => {
          if (doc.y > 680) { doc.addPage(); doc.y = 50; }
          doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(
            `${i + 1}. ${d.condition}`,
            PAGE_MARGIN, doc.y,
            { continued: true },
          );
          const color = severityColor(d.confidence);
          const badge = ` ${d.confidence}% `;
          const badgeW = doc.font("Helvetica-Bold").fontSize(8).widthOfString(badge) + 4;
          const badgeX = PAGE_MARGIN + doc.font("Helvetica-Bold").fontSize(9).widthOfString(`${i + 1}. ${d.condition} `);
          doc.fillColor(color).roundedRect(badgeX, doc.y, badgeW, 11, 3).fill();
          doc.fillColor("#ffffff").text(badge, badgeX + 2, doc.y + 1.5, { width: badgeW - 4 });
          doc.moveDown(0.4);
          if (d.supportingFindings?.length > 0) {
            doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Supporting: ${d.supportingFindings.join(", ")}`, PAGE_MARGIN + 12, doc.y, { width: CONTENT_WIDTH - 12 });
            doc.moveDown(0.25);
          }
          if (d.contradictoryFindings?.length > 0) {
            doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Contradicting: ${d.contradictoryFindings.join(", ")}`, PAGE_MARGIN + 12, doc.y, { width: CONTENT_WIDTH - 12 });
            doc.moveDown(0.25);
          }
          if (d.explanation) {
            doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(d.explanation, PAGE_MARGIN + 12, doc.y, { width: CONTENT_WIDTH - 12 });
            doc.moveDown(0.25);
          }
          doc.moveDown(0.3);
        });
      }

      // Clinical Reasoning
      if (report.clinicalReasoning) {
        drawSectionTitle(doc, "Clinical Reasoning");
        doc.font("Helvetica").fontSize(9).fillColor(INK).text(report.clinicalReasoning, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.4);
      }

      // Risk Assessment
      if (report.riskAssessment.overallScore > 0 || report.riskAssessment.emergencyFlags.length > 0) {
        drawSectionTitle(doc, "Risk Assessment");
        if (report.riskAssessment.overallScore > 0) {
          const scoreText = `Risk Score: ${report.riskAssessment.overallScore}/100 (${report.riskAssessment.riskCategory})`;
          const badgeW = doc.font("Helvetica-Bold").fontSize(8).widthOfString(scoreText) + 12;
          doc.fillColor("#f1f5f9").roundedRect(PAGE_MARGIN, doc.y, badgeW, 14, 3).fill();
          doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(8).text(scoreText, PAGE_MARGIN + 6, doc.y + 3, { width: badgeW - 12 });
          doc.moveDown(0.7);
        }
        if (report.riskAssessment.redFlagSymptoms.length > 0) {
          doc.font("Helvetica-Bold").fontSize(8).fillColor(MODERATE).text("Red Flag Symptoms:", PAGE_MARGIN, doc.y + 2);
          drawList(doc, report.riskAssessment.redFlagSymptoms.map(f => `${f}`));
        }
        if (report.riskAssessment.emergencyFlags.length > 0) {
          doc.font("Helvetica-Bold").fontSize(8).fillColor(SEVERE).text("Emergency Flags — Seek Immediate Care:", PAGE_MARGIN, doc.y + 2);
          drawList(doc, report.riskAssessment.emergencyFlags);
        }
        doc.moveDown(0.3);
      }

      // Recommended Investigations
      if (report.recommendedInvestigations.length > 0) {
        drawSectionTitle(doc, "Recommended Investigations");
        drawTable(doc,
          ["Investigation", "Reason", "Priority"],
          report.recommendedInvestigations.map(t => [t.testName, t.reason, t.priority]),
          [150, 205, 140],
        );
        doc.font("Helvetica-Oblique").fontSize(7).fillColor(FAINT)
          .text("These are suggestions only. A healthcare professional determines which tests are necessary.", PAGE_MARGIN, doc.y);
        doc.moveDown(0.4);
      }

      // Medication & Safety
      const ms = report.medicationSafety;
      if ((ms.interactions.length > 0 || ms.allergyWarnings.length > 0 || ms.contraindications.length > 0 || ms.otcGuidance.length > 0)) {
        drawSectionTitle(doc, "Medication & Safety");
        if (ms.allergyWarnings.length > 0) drawField(doc, "Allergy warnings:", ms.allergyWarnings.join("; "));
        if (ms.interactions.length > 0) drawField(doc, "Interactions:", ms.interactions.map(x => `${x.description} (${x.severity})`).join("; "));
        if (ms.contraindications.length > 0) drawField(doc, "Contraindications:", ms.contraindications.join("; "));
        if (ms.otcGuidance.length > 0) {
          doc.moveDown(0.15);
          doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("OTC Guidance:", PAGE_MARGIN, doc.y);
          drawList(doc, ms.otcGuidance);
        }
      }

      // Self-Care
      if (report.selfCareRecommendations.length > 0) {
        drawSectionTitle(doc, "Self-Care & Advice");
        report.selfCareRecommendations.forEach(r => {
          drawField(doc, `${r.category}:`, r.advice);
        });
        doc.moveDown(0.3);
      }

      // Follow-Up Plan
      drawSectionTitle(doc, "Follow-Up Plan");
      drawField(doc, "Monitor:", report.followUpPlan.whenToMonitor || "Monitor symptoms as they develop.");
      drawField(doc, "Review:", report.followUpPlan.reviewTimeline || "Follow up with a healthcare provider if symptoms persist.");
      if (report.followUpPlan.immediateAttentionRequired) {
        drawField(doc, "Seek immediate care:", report.followUpPlan.immediateAttentionRequired);
      }

      // Signature
      if (doc.y > 630) { doc.addPage(); doc.y = 60; }
      doc.y += 22;
      doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + 220, doc.y).lineWidth(0.8).strokeColor(INK).stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text("Consulting Physician", PAGE_MARGIN, doc.y + 5);
      doc.font("Helvetica").fontSize(6.5).fillColor(FAINT).text("Name  •  Registration No.", PAGE_MARGIN, doc.y + 15);

      // Disclaimer
      drawDisclaimer(doc, report.disclaimer || "This report is AI-generated for informational purposes only. It is not a diagnosis and must not replace consultation with a licensed healthcare professional.");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}