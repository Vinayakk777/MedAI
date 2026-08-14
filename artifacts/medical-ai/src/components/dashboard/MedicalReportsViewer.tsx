import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  FileText, Download, Printer, Copy, AlertTriangle,
  ChevronDown, ChevronUp, Building2, HeartPulse, Stethoscope,
  FlaskConical, ShieldAlert, Pill, Activity, Brain, Gauge, UserRound,
} from "lucide-react";

type MedicalReport = {
  id: string;
  conversationId: string | null;
  title: string;
  summary: string | null;
  score: number | null;
  prevScore: number | null;
  highlights: string[] | null;
  trend: string | null;
  badge: string | null;
  reportData: any;
  pdfGenerated: number | null;
  version: number;
  reportDate: string;
};

const HOSPITAL_NAME = "MedAI Multi-Specialty Clinic";
const HOSPITAL_TAGLINE = "Accredited Consultative & Diagnostic Centre";

const severityBadge = (val: number) =>
  val >= 70 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : val >= 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-rose-500/10 text-rose-400 border-rose-500/20";

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className={`${full ? "col-span-2 md:col-span-4" : ""}`}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[11px] font-medium text-slate-800 leading-snug">{value}</p>
    </div>
  );
}

function DocumentSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="px-6 py-4 border-b border-slate-200/80">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-teal-700" />
        <h4 className="font-serif font-bold text-[13px] text-teal-900 uppercase tracking-wide">
          {title}
        </h4>
      </div>
      <div className="space-y-1 text-slate-700">{children}</div>
    </section>
  );
}

function HospitalReportDocument({ report, patientName }: { report: MedicalReport; patientName: string }) {
  const data = report.reportData ?? {};
  const patientInfo = data.patientInfo ?? {};
  const consultationDate = data.consultationDate ?? report.reportDate;
  const visitDate = new Date(consultationDate);
  const reportDate = new Date(report.reportDate);

  const existingConditions = patientInfo.existingConditions ?? [];
  const allergies = patientInfo.allergies ?? [];
  const currentMedications = patientInfo.currentMedications ?? [];

  const hpi = data.historyOfPresentIllness ?? {};
  const hpiHasContent =
    !!hpi.duration || !!hpi.severity || (hpi.associatedSymptoms?.length ?? 0) > 0 ||
    (hpi.aggravatingFactors?.length ?? 0) > 0 || (hpi.relievingFactors?.length ?? 0) > 0 || !!hpi.symptomTimeline;

  const riskAssessment = data.riskAssessment ?? {};
  const followUp = data.followUpPlan ?? {};
  const medSafety = data.medicationSafety ?? {};
  const confidence = data.confidenceSummary ?? {};

  const symptoms = data.extractedSymptoms ?? [];
  const diagnoses = data.differentialDiagnoses ?? [];
  const investigations = data.recommendedInvestigations ?? [];
  const selfCare = data.selfCareRecommendations ?? [];

  return (
    <div className="rounded-lg bg-white text-slate-900 shadow-[0_1px_10px_rgba(0,0,0,0.45)] overflow-hidden">
      {/* Hospital masthead */}
      <div className="px-6 py-5 bg-gradient-to-r from-teal-900 to-teal-700 text-white flex items-center gap-4">
        <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center flex-shrink-0">
          <HeartPulse className="w-6 h-6 text-teal-100" />
        </div>
        <div className="flex-1">
          <h3 className="font-serif font-bold text-lg leading-tight">{HOSPITAL_NAME}</h3>
          <p className="text-[10px] tracking-wide text-teal-100/90 uppercase">{HOSPITAL_TAGLINE}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-100/90">Consultation Report</p>
          <p className="text-[10px] text-teal-100/70">Report v{report.version}</p>
        </div>
      </div>

      {/* Report meta strip */}
      <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-x-8 gap-y-1 text-[10px] text-slate-500">
        <span><span className="font-semibold text-slate-700">Report No:</span> {report.id.slice(0, 8).toUpperCase()}</span>
        <span><span className="font-semibold text-slate-700">Visit Date:</span> {visitDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
        <span><span className="font-semibold text-slate-700">Generated:</span> {reportDate.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* Patient information box */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-1.5 mb-2.5">
          <UserRound className="w-3.5 h-3.5 text-teal-700" />
          <h4 className="font-serif font-bold text-[13px] text-teal-900 uppercase tracking-wide">Patient Information</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Patient Name" value={patientInfo.name || patientName || "—"} />
          <Field label="Age" value={patientInfo.age ? `${patientInfo.age} yrs` : "—"} />
          <Field label="Sex" value={patientInfo.sex || "—"} />
          <Field label="Patient ID" value={report.id.slice(0, 8).toUpperCase()} />
          <Field label="Height" value={patientInfo.height || null} />
          <Field label="Weight" value={patientInfo.weight || null} />
          <Field label="BMI" value={patientInfo.bmi || null} />
          <Field label="Known Conditions" value={existingConditions.length > 0 ? existingConditions.join(", ") : "—"} />
          <Field label="Allergies" value={allergies.length > 0 ? allergies.join(", ") : "—"} full />
          {currentMedications.length > 0 && (
            <Field label="Current Medications" value={currentMedications.join("; ")} full />
          )}
        </div>
      </div>

      {data.chiefComplaint && (
        <DocumentSection title="Chief Complaint" icon={Activity}>
          <p className="text-[12px] leading-relaxed">{data.chiefComplaint}</p>
        </DocumentSection>
      )}

      {hpiHasContent && (
        <DocumentSection title="History of Present Illness" icon={Stethoscope}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            {hpi.duration && (
              <p><span className="font-semibold text-slate-500">Duration:</span> {hpi.duration}</p>
            )}
            {hpi.severity && (
              <p><span className="font-semibold text-slate-500">Severity:</span> {hpi.severity}</p>
            )}
            {hpi.symptomTimeline && (
              <p className="col-span-2 md:col-span-3"><span className="font-semibold text-slate-500">Timeline:</span> {hpi.symptomTimeline}</p>
            )}
            {(hpi.associatedSymptoms?.length ?? 0) > 0 && (
              <p className="col-span-2 md:col-span-3"><span className="font-semibold text-slate-500">Associated Symptoms:</span> {hpi.associatedSymptoms.join(", ")}</p>
            )}
            {(hpi.aggravatingFactors?.length ?? 0) > 0 && (
              <p><span className="font-semibold text-slate-500">Aggravating:</span> {hpi.aggravatingFactors.join(", ")}</p>
            )}
            {(hpi.relievingFactors?.length ?? 0) > 0 && (
              <p><span className="font-semibold text-slate-500">Relieving:</span> {hpi.relievingFactors.join(", ")}</p>
            )}
          </div>
        </DocumentSection>
      )}

      {symptoms.length > 0 && (
        <DocumentSection title="Recorded Symptoms" icon={Activity}>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-600">
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Symptom</th>
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Severity</th>
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {symptoms.map((s: any, i: number) => (
                <tr key={i} className={i % 2 ? "bg-slate-50" : ""}>
                  <td className="border border-slate-300 px-2 py-1.5">{s.symptom}</td>
                  <td className="border border-slate-300 px-2 py-1.5 capitalize">{s.severity}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{s.duration || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentSection>
      )}

      {diagnoses.length > 0 && (
        <DocumentSection title="Differential Diagnosis" icon={Brain}>
          <ol className="space-y-1.5 list-decimal list-inside">
            {diagnoses.map((d: any, i: number) => (
              <li key={i} className="text-[11px]">
                <span className="font-semibold text-slate-800">{d.condition}</span>
                <span className="ml-1.5">{d.confidence != null ? `${d.confidence}% confidence` : ""}</span>
                {(d.supportingFindings?.length ?? 0) > 0 && (
                  <p className="ml-5 text-slate-500">Supporting: {d.supportingFindings.join(", ")}</p>
                )}
                {(d.contradictoryFindings?.length ?? 0) > 0 && (
                  <p className="ml-5 text-slate-500">Contradicting: {d.contradictoryFindings.join(", ")}</p>
                )}
                {d.explanation && <p className="ml-5 text-slate-600">{d.explanation}</p>}
              </li>
            ))}
          </ol>
        </DocumentSection>
      )}

      {data.clinicalReasoning && (
        <DocumentSection title="Clinical Reasoning" icon={Brain}>
          <p className="text-[11px] leading-relaxed">{data.clinicalReasoning}</p>
        </DocumentSection>
      )}

      {(riskAssessment.overallScore > 0 || (riskAssessment.emergencyFlags?.length ?? 0) > 0) && (
        <DocumentSection title="Risk Assessment" icon={ShieldAlert}>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {riskAssessment.overallScore > 0 && (
              <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 border border-slate-300 text-slate-700">
                Risk Score: {riskAssessment.overallScore}/100 ({riskAssessment.riskCategory})
              </span>
            )}
            {(riskAssessment.redFlagSymptoms?.length ?? 0) > 0 && (
              <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-300 text-amber-700">
                {riskAssessment.redFlagSymptoms.length} red-flag symptom{riskAssessment.redFlagSymptoms.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {(riskAssessment.emergencyFlags?.length ?? 0) > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">Emergency Flags</p>
              <ul className="list-disc list-inside text-[11px] text-rose-700">
                {riskAssessment.emergencyFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {(riskAssessment.redFlagSymptoms?.length ?? 0) > 0 && (
            <p className="text-[11px] mt-1 text-slate-600">Red flags: {riskAssessment.redFlagSymptoms.join(", ")}</p>
          )}
        </DocumentSection>
      )}

      {investigations.length > 0 && (
        <DocumentSection title="Recommended Investigations" icon={FlaskConical}>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-600">
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Investigation</th>
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Reason</th>
                <th className="border border-slate-300 px-2 py-1.5 font-semibold">Priority</th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((t: any, i: number) => (
                <tr key={i} className={i % 2 ? "bg-slate-50" : ""}>
                  <td className="border border-slate-300 px-2 py-1.5 font-medium">{t.testName}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{t.reason || "—"}</td>
                  <td className="border border-slate-300 px-2 py-1.5 capitalize">{t.priority || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentSection>
      )}

      {((medSafety.interactions?.length ?? 0) > 0 ||
        (medSafety.allergyWarnings?.length ?? 0) > 0 ||
        (medSafety.contraindications?.length ?? 0) > 0 ||
        (medSafety.otcGuidance?.length ?? 0) > 0 || currentMedications.length > 0) && (
        <DocumentSection title="Medication & Safety" icon={Pill}>
          {(medSafety.interactions?.length ?? 0) > 0 && (
            <p className="text-[11px]"><span className="font-semibold text-slate-500">Interactions:</span> {medSafety.interactions.map((x: any) => `${x.description} (${x.severity})`).join("; ")}</p>
          )}
          {(medSafety.allergyWarnings?.length ?? 0) > 0 && (
            <p className="text-[11px] text-rose-700"><span className="font-semibold">Allergy Warnings:</span> {medSafety.allergyWarnings.join("; ")}</p>
          )}
          {(medSafety.contraindications?.length ?? 0) > 0 && (
            <p className="text-[11px] text-rose-700"><span className="font-semibold">Contraindications:</span> {medSafety.contraindications.join("; ")}</p>
          )}
          {(medSafety.otcGuidance?.length ?? 0) > 0 && (
            <ul className="list-disc list-inside text-[11px] space-y-0.5">
              {medSafety.otcGuidance.map((g: string, i: number) => <li key={i}>{g}</li>)}
            </ul>
          )}
        </DocumentSection>
      )}

      {selfCare.length > 0 && (
        <DocumentSection title="Self-Care & Advice" icon={HeartPulse}>
          {selfCare.map((r: any, i: number) => (
            <p key={i} className="text-[11px]">
              <span className="font-semibold text-slate-500 capitalize">{r.category}:</span> {r.advice}
            </p>
          ))}
        </DocumentSection>
      )}

      <DocumentSection title="Follow-Up Plan" icon={Stethoscope}>
        <p className="text-[11px]"><span className="font-semibold text-slate-500">Monitor:</span> {followUp.whenToMonitor ?? "Monitor symptoms as they develop."}</p>
        <p className="text-[11px]"><span className="font-semibold text-slate-500">Review:</span> {followUp.reviewTimeline ?? "Follow up if symptoms persist."}</p>
        {followUp.immediateAttentionRequired && (
          <p className="text-[11px] text-rose-700"><span className="font-semibold">Seek immediate care:</span> {followUp.immediateAttentionRequired}</p>
        )}
      </DocumentSection>

      {(confidence.confidenceScore > 0 || (confidence.missingInformation?.length ?? 0) > 0) && (
        <DocumentSection title="Assessment Confidence" icon={Gauge}>
          <p className="text-[11px]">
            {confidence.confidenceScore > 0 && <span><span className="font-semibold text-slate-500">Confidence:</span> {confidence.confidenceScore}/100 ({confidence.overallConfidence ?? "—"})</span>}
            {(confidence.missingInformation?.length ?? 0) > 0 && (
              <span className="block mt-1"><span className="font-semibold text-slate-500">Missing information:</span> {confidence.missingInformation.join("; ")}</span>
            )}
          </p>
        </DocumentSection>
      )}

      {/* Signature block */}
      <div className="px-6 py-6 flex flex-wrap items-end justify-between gap-6">
        <div className="text-[10px] text-slate-400 max-w-[240px]">
          <Building2 className="w-4 h-4 mb-1 text-teal-700" />
          <p className="font-semibold text-slate-600">{HOSPITAL_NAME}</p>
          <p className="text-[9px]">Generated by the MedAI AI Clinical Engine. Digitally recorded, patient-confidential.</p>
        </div>
        <div className="text-center">
          <div className="w-44 border-b border-slate-400 h-10" />
          <p className="text-[10px] font-semibold text-slate-600 mt-1">Consulting Physician</p>
          <p className="text-[9px] text-slate-400">Name • Reg. No.</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-6 py-3 bg-rose-50 border-t border-rose-200">
        <p className="text-[9px] text-rose-700 leading-relaxed">
          <span className="font-bold">Disclaimer:</span>{" "}
          {data.disclaimer ?? "This report is AI-generated for informational purposes only. It is not a diagnosis and must not replace consultation with a licensed healthcare professional."}
        </p>
      </div>
    </div>
  );
}

function buildPrintHtml(report: MedicalReport, patientName: string): string {
  const data = report.reportData ?? {};
  const patientInfo = data.patientInfo ?? {};
  const existingConditions = patientInfo.existingConditions ?? [];
  const diagnoses = data.differentialDiagnoses ?? [];
  const investigations = data.recommendedInvestigations ?? [];
  const selfCare = data.selfCareRecommendations ?? [];
  const riskAssessment = data.riskAssessment ?? {};
  const followUp = data.followUpPlan ?? {};
  const symptoms = data.extractedSymptoms ?? [];
  const consultationDate = data.consultationDate ?? report.reportDate;

  const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const symptomRows = symptoms
    .map((s: any) => `<tr><td>${esc(s.symptom)}</td><td>${esc(s.severity)}</td><td>${esc(s.duration)}</td></tr>`)
    .join("");
  const diagRows = diagnoses
    .map((d: any) => `<li><strong>${esc(d.condition)}</strong>${d.confidence != null ? ` (${esc(d.confidence)}% confidence)` : ""}${(d.supportingFindings?.length ?? 0) > 0 ? `<br/><span class="muted">Supporting: ${esc(d.supportingFindings.join(", "))}</span>` : ""}</li>`)
    .join("");
  const invRows = investigations
    .map((t: any) => `<tr><td>${esc(t.testName)}</td><td>${esc(t.reason)}</td><td>${esc(t.priority)}</td></tr>`)
    .join("");
  const careRows = selfCare
    .map((r: any) => `<p><strong>${esc(r.category)}:</strong> ${esc(r.advice)}</p>`)
    .join("");
  const medSafety = data.medicationSafety ?? {};

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Consultation Report</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;color:#1e293b;max-width:820px;margin:0 auto;padding:32px;font-size:12px;line-height:1.5;}
    .masthead{border-bottom:3px double #0f766e;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
    .facility{font-size:22px;font-weight:700;color:#134e4a;}
    .tagline{font-size:10px;letter-spacing:1px;color:#64748b;text-transform:uppercase;}
    .doctitle{font-size:15px;font-weight:700;letter-spacing:1px;color:#0f766e;text-transform:uppercase;text-align:right;}
    .meta{display:flex;gap:28px;font-size:10px;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#0f766e;border-bottom:1px solid #ccdde0;padding-bottom:4px;margin:18px 0 8px;}
    .pi{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;}
    .pi .l{font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700;}
    table{width:100%;border-collapse:collapse;font-size:11px;}
    td,th{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;}
    th{background:#f1f5f9;font-weight:700;}
    ul{margin:4px 0;}
    .risk{display:inline-block;padding:2px 10px;border-radius:99px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:10px;font-weight:700;margin-right:6px;}
    .flags{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:6px;padding:8px 10px;font-size:11px;margin-top:6px;}
    .sig{margin-top:36px;display:flex;justify-content:flex-end;}
    .sigline{width:220px;border-top:1px solid #64748b;padding-top:6px;text-align:center;font-size:10px;color:#334155;}
    .disc{margin-top:28px;border-top:2px solid #fecaca;background:#fff1f2;color:#be123c;font-size:9.5px;padding:8px 10px;border-radius:4px;}
  </style></head><body>
  <div class="masthead">
    <div><div class="facility">${esc(HOSPITAL_NAME)}</div><div class="tagline">${esc(HOSPITAL_TAGLINE)}</div></div>
    <div class="doctitle">Consultation Report</div>
  </div>
  <div class="meta">
    <span><strong>Report No:</strong> ${esc(report.id.slice(0, 8).toUpperCase())}</span>
    <span><strong>Visit Date:</strong> ${esc(new Date(consultationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</span>
    <span><strong>Generated:</strong> ${esc(new Date(report.reportDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</span>
  </div>
  <h2 style="margin-top:0;">Patient Information</h2>
  <div class="pi">
    <div><div class="l">Patient</div>${esc(patientInfo.name || patientName || "—")}</div>
    <div><div class="l">Age</div>${patientInfo.age ? esc(patientInfo.age) + " yrs" : "—"}</div>
    <div><div class="l">Sex</div>${esc(patientInfo.sex || "—")}</div>
    <div><div class="l">Patient ID</div>${esc(report.id.slice(0, 8).toUpperCase())}</div>
    ${existingConditions.length ? `<div><div class="l">Conditions</div>${esc(existingConditions.join(", "))}</div>` : ""}
  </div>
  ${data.chiefComplaint ? `<h2>Chief Complaint</h2><p>${esc(data.chiefComplaint)}</p>` : ""}
  ${symptoms.length ? `<h2>Recorded Symptoms</h2><table><tr><th>Symptom</th><th>Severity</th><th>Duration</th></tr>${symptomRows}</table>` : ""}
  ${diagnoses.length ? `<h2>Differential Diagnosis</h2><ul>${diagRows}</ul>` : ""}
  ${riskAssessment.overallScore > 0 ? `<h2>Risk Assessment</h2><span class="risk">Risk Score: ${esc(riskAssessment.overallScore)}/100 (${esc(riskAssessment.riskCategory)})</span>${(riskAssessment.redFlagSymptoms?.length ?? 0) ? `<p style="margin-top:6px;">Red flags: ${esc(riskAssessment.redFlagSymptoms.join(", "))}</p>` : ""}${(riskAssessment.emergencyFlags?.length ?? 0) ? `<div class="flags"><strong>Emergency Flags:</strong> ${esc(riskAssessment.emergencyFlags.join(", "))}</div>` : ""}` : ""}
  ${investigations.length ? `<h2>Recommended Investigations</h2><table><tr><th>Investigation</th><th>Reason</th><th>Priority</th></tr>${invRows}</table>` : ""}
  ${(medSafety.interactions?.length ?? 0) || (medSafety.allergyWarnings?.length ?? 0) ? `<h2>Medication &amp; Safety</h2>${(medSafety.allergyWarnings?.length ?? 0) ? `<p style="color:#be123c;"><strong>Allergy warnings:</strong> ${esc(medSafety.allergyWarnings.join("; "))}</p>` : ""}${(medSafety.interactions?.length ?? 0) ? `<p><strong>Interactions:</strong> ${esc(medSafety.interactions.map((x: any) => `${x.description} (${x.severity})`).join("; "))}</p>` : ""}` : ""}
  ${selfCare.length ? `<h2>Self-Care &amp; Advice</h2>${careRows}` : ""}
  ${followUp.whenToMonitor || followUp.reviewTimeline ? `<h2>Follow-Up Plan</h2>${followUp.whenToMonitor ? `<p><strong>Monitor:</strong> ${esc(followUp.whenToMonitor)}</p>` : ""}${followUp.reviewTimeline ? `<p><strong>Review:</strong> ${esc(followUp.reviewTimeline)}</p>` : ""}${followUp.immediateAttentionRequired ? `<p style="color:#be123c;"><strong>Seek immediate care:</strong> ${esc(followUp.immediateAttentionRequired)}</p>` : ""}` : ""}
  <div class="sig"><div class="sigline">Consulting Physician<br/><span style="font-size:9px;">Name • Reg. No.</span></div></div>
  <div class="disc"><strong>Disclaimer:</strong> ${esc(data.disclaimer ?? "This report is AI-generated for informational purposes only. It is not a diagnosis and must not replace consultation with a licensed healthcare professional.")}</div>
  </body></html>`;
}

export function MedicalReportsViewer() {
  const { user } = useUser();
  const patientName =
    user?.fullName ??
    user?.firstName ??
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    "Patient";

  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const { data, isLoading, error } = useQuery<MedicalReport[]>({
    queryKey: ["dashboard", "reports"],
    queryFn: () => fetch("/api/reports").then(r => r.json()),
  });

  const reports = data ?? [];

  const handleDownload = async (report: MedicalReport) => {
    setDownloading(report.id);
    try {
      const res = await fetch(`/api/reports/${report.id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medai-report-${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleCopySummary = async (report: MedicalReport) => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(report.summary ?? "No summary available.");
    } catch { /* ignore */ }
    setCopying(false);
  };

  const handlePrint = (report: MedicalReport) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintHtml(report, patientName));
    w.document.close();
    w.focus();
    w.print();
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-semibold text-foreground">Medical Reports</h3></div>
        <div className="space-y-3 animate-pulse">
          {[0,1,2].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-rose-400" /><h3 className="text-sm font-semibold text-foreground">Unable to Load Reports</h3></div>
        <p className="text-xs text-muted-foreground">Failed to fetch medical reports.</p>
      </motion.div>
    );
  }

  if (reports.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-cyan-400" /><h3 className="text-sm font-semibold text-foreground">Medical Reports</h3></div>
        <p className="text-xs text-muted-foreground mb-4">No medical reports yet</p>
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/50">Complete a consultation to generate a medical report.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Medical Reports</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{reports.length} report{reports.length !== 1 ? "s" : ""} generated</p>

      <div className="space-y-3">
        {reports.map((report) => {
          const isExpanded = expandedReport === report.id;
          const trendColor = report.trend === "improving" ? "text-emerald-400" : report.trend === "worsening" ? "text-rose-400" : "text-muted-foreground/40";

          return (
            <div key={report.id} className="rounded-xl border border-white/5 bg-white/4 overflow-hidden">
              <div className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedReport(isExpanded ? null : report.id)}>
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{report.title}</span>
                    <span className={`text-[10px] font-medium ${severityBadge(report.score ?? 0)} px-1.5 py-0.5 rounded-full`}>
                      Score: {report.score ?? "—"}
                    </span>
                    {report.trend && (
                      <span className={`text-[10px] font-medium capitalize ${trendColor}`}>{report.trend}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50">
                    <span>{new Date(report.reportDate).toLocaleDateString()}</span>
                    <span>v{report.version}</span>
                    <span>Report No: {report.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/30" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30" />}
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5">
                    <div className="px-4 py-4 space-y-3">
                      {report.summary && (
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">{report.summary}</p>
                      )}

                      {report.highlights && report.highlights.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {report.highlights.map((h, i) => (
                            <span key={i} className="text-[10px] text-primary bg-primary/8 border border-primary/15 px-2 py-0.5 rounded-full">{h}</span>
                          ))}
                        </div>
                      )}

                      <HospitalReportDocument report={report} patientName={patientName} />

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button onClick={() => handleDownload(report)} disabled={downloading === report.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors disabled:opacity-50">
                          <Download className="w-3 h-3" />{downloading === report.id ? "Generating..." : "Download PDF"}
                        </button>
                        <button onClick={() => handlePrint(report)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/15 transition-colors">
                          <Printer className="w-3 h-3" />Print
                        </button>
                        <button onClick={() => handleCopySummary(report)} disabled={copying}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors disabled:opacity-50">
                          <Copy className="w-3 h-3" />{copying ? "Copied!" : "Copy Summary"}
                        </button>
                      </div>

                      {/* Disclaimer */}
                      <div className="rounded-lg border border-rose-500/15 bg-rose-500/5 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span className="text-[10px] font-semibold text-rose-400">Medical Disclaimer</span>
                        </div>
                        <p className="text-[10px] text-rose-400/70 leading-relaxed">
                          {report.reportData?.disclaimer ?? "This report is AI-generated for informational purposes only. It is not a diagnosis and must not replace consultation with a licensed healthcare professional."}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}