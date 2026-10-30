"use client";

import { useState } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, FileTextIcon, InfoIcon, ShieldCheckIcon, SparklesIcon } from "@/components/ui/icons";
import { PolicyEvidenceViewer } from "@/components/kyakata/policy-evidence-viewer";
import { findClause } from "@/lib/retrieve";
import type { ClauseEvidence, Deduction, DocSet, Status } from "@/lib/types";
import { extractClaimAmounts, parseDeductions, verify, type Verification } from "@/lib/verify";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type DeductionAnalysis = { deduction: Deduction; clause: ClauseEvidence | null; result: Verification };

const STATUS: Record<Status, { label: string; className: string }> = {
  verified: { label: "Amount matched", className: "bg-[#E5F4F1] text-[#0F766E]" },
  partly: { label: "Needs review", className: "bg-[#fff7e8] text-[#9a6500]" },
  cannot_verify: { label: "More evidence needed", className: "bg-[#EEF2FF] text-[#5063a8]" },
};

function clauseNumber(evidence: ClauseEvidence | null) {
  return evidence?.quote.match(/^\s*(\d+(?:\.\d+)*)\.?\s/m)?.[1] ?? null;
}

function category(deduction: Deduction) {
  return deduction.label.split(/\s*[-–:]\s*/)[0]?.trim() || deduction.label;
}

function combinedStatus(items: DeductionAnalysis[]): Status {
  if (!items.length || items.some((item) => item.result.status === "cannot_verify")) return "cannot_verify";
  if (items.some((item) => item.result.status === "partly")) return "partly";
  return "verified";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function insurerQuestions(items: DeductionAnalysis[]) {
  const questions: string[] = [];
  for (const item of items) {
    if (!item.clause) questions.push(`Please identify the exact policy clause and page used for the ${category(item.deduction)} deduction of ${rupees.format(item.deduction.amount)}.`);
    if (item.result.missing.some((message) => /calculation|reproduces|breakdown/i.test(message))) questions.push(`Please share the line-by-line calculation for the ${rupees.format(item.deduction.amount)} ${category(item.deduction)} deduction.`);
  }
  if (items.length && questions.length < 3) questions.push("Please confirm which bill items were reduced and how each item was linked to the policy provision.");
  return unique(questions).slice(0, 3);
}

function DashboardSkeleton() {
  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Claim dashboard loading" aria-busy="true"><div className="h-5 w-36 animate-pulse rounded bg-slate-100" /><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div></section>;
}

export function ClaimDashboard({ docs, ready, onToast }: { docs: DocSet; ready: boolean; onToast: (message: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!ready) return <DashboardSkeleton />;

  const deductions = parseDeductions(docs.letter);
  const analyses: DeductionAnalysis[] = deductions.map((deduction) => {
    const clause = findClause(deduction.label, "policy", docs.policy);
    return { deduction, clause, result: verify(deduction, Boolean(clause), docs) };
  });
  const amounts = extractClaimAmounts(docs);
  const status = combinedStatus(analyses);
  const facts = unique(analyses.flatMap((item) => item.result.known));
  const missing = unique(analyses.flatMap((item) => item.result.missing));
  const questions = insurerQuestions(analyses);
  const selectedAnalysis = selected === null ? null : analyses[selected] ?? null;
  const overview = [
    { label: "Hospital bill", value: amounts.hospitalBill === undefined ? "Not found" : rupees.format(amounts.hospitalBill) },
    { label: "Amount claimed", value: amounts.amountClaimed === undefined ? "Not found" : rupees.format(amounts.amountClaimed) },
    { label: "Amount approved", value: amounts.amountApproved === undefined ? "Not found" : rupees.format(amounts.amountApproved) },
    { label: "Total deducted", value: deductions.length ? rupees.format(amounts.totalDeducted) : "Not identified" },
  ];

  async function copyQuestion(question: string) {
    try {
      await navigator.clipboard.writeText(question);
      onToast("Question copied to your clipboard");
    } catch {
      onToast("Could not copy the question. Please select and copy it manually.");
    }
  }

  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="claim-dashboard-heading">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0F766E]">Claim deduction dashboard</p><h2 id="claim-dashboard-heading" className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#14243A]">Trace each deduction back to your documents</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">Figures and evidence below come from the uploaded PDF text. Open any deduction to inspect its policy evidence without leaving this page.</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${STATUS[status].className}`}><ShieldCheckIcon size={14} />{STATUS[status].label}</span></div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{overview.map((item) => <div key={item.label} className="rounded-2xl border border-slate-100 bg-[#F7F8FA] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#667085]">{item.label}</p><p className="mt-2 text-xl font-bold tracking-[-0.035em] text-[#14243A]">{item.value}</p></div>)}<div className="rounded-2xl border border-[#d6ece8] bg-[#f5fcfa] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#0F766E]">Verification</p><p className="mt-2 text-sm font-bold text-[#14243A]">{STATUS[status].label}</p><p className="mt-1 text-xs leading-5 text-[#667085]">{analyses.length ? `${analyses.filter((item) => item.result.status === "verified").length} of ${analyses.length} deduction amounts matched.` : "No structured deduction amount was found."}</p></div></div>

    <div className="mt-7"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#667085]">Interactive deduction breakdown</p><h3 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#14243A]">Deductions stated in your settlement letter</h3></div><FileTextIcon size={20} className="text-[#0F766E]" /></div>
      {analyses.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{analyses.map((item, index) => <button key={`${item.deduction.page}-${item.deduction.line}`} type="button" onClick={() => setSelected(index)} aria-haspopup="dialog" className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#8ecfc4] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#667085]">{category(item.deduction)}</p><p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[#14243A]">{rupees.format(item.deduction.amount)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[item.result.status].className}`}>{STATUS[item.result.status].label}</span></div><div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#667085]">Reason in settlement letter</p><p className="mt-1 text-sm leading-6 text-[#344a5d]">{item.deduction.line}</p><p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#0F766E]">{item.clause ? `Policy ${clauseNumber(item.clause)} · page ${item.clause.page}` : "No policy evidence matched"}<ArrowUpRightIcon size={14} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></p></div></button>)}</div> : <div className="mt-4 rounded-2xl border border-[#dfe5f5] bg-[#EEF2FF] p-4 text-sm leading-6 text-[#5063a8]"><InfoIcon className="mr-2 inline" size={16} />No deduction line with an amount was found in the extracted settlement letter. You can still use the assistant to ask about the documents.</div>}</div>

    <div className="mt-7 grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-slate-100 bg-[#F7F8FA] p-4" aria-labelledby="known-heading"><p id="known-heading" className="flex items-center gap-2 text-sm font-bold text-[#14243A]"><CheckIcon size={17} className="text-[#0F766E]" />What we know</p><ul className="mt-3 space-y-2">{facts.length ? facts.slice(0, 6).map((fact) => <li key={fact} className="text-sm leading-6 text-[#526d6a]">{fact}</li>) : <li className="text-sm leading-6 text-[#667085]">No structured claim facts could be confirmed from the extracted text yet.</li>}</ul></section><section className="rounded-2xl border border-[#f2dfba] bg-[#fffaf0] p-4" aria-labelledby="missing-heading"><p id="missing-heading" className="flex items-center gap-2 text-sm font-bold text-[#6d5300]"><InfoIcon size={17} />What is missing</p><ul className="mt-3 space-y-2">{missing.length ? missing.slice(0, 6).map((item) => <li key={item} className="text-sm leading-6 text-[#735f29]">{item}</li>) : <li className="text-sm leading-6 text-[#735f29]">No additional missing details were identified by the current checks.</li>}</ul></section></div>

    <section className="mt-4 rounded-2xl border border-[#d6ece8] bg-[#f5fcfa] p-4" aria-labelledby="insurer-questions-heading"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0F766E]"><SparklesIcon size={17} /></span><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#0F766E]">Next step</p><h3 id="insurer-questions-heading" className="mt-1 text-base font-bold text-[#14243A]">What to ask your insurer</h3></div></div>{questions.length ? <ol className="mt-4 space-y-2">{questions.map((question, index) => <li key={question} className="flex items-start gap-3 rounded-xl bg-white/80 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E5F4F1] text-xs font-bold text-[#0F766E]">{index + 1}</span><p className="min-w-0 flex-1 text-sm leading-6 text-[#344a5d]">{question}</p><button type="button" onClick={() => void copyQuestion(question)} className="rounded-lg p-1.5 text-[#0F766E] transition hover:bg-[#E5F4F1] focus:outline-none focus:ring-2 focus:ring-[#0F766E]" aria-label={`Copy question ${index + 1}`}><CopyIcon size={16} /></button></li>)}</ol> : <p className="mt-3 text-sm leading-6 text-[#526d6a]">Upload all three documents and a structured deduction to receive evidence-based questions.</p>}</section>

    <PolicyEvidenceViewer deduction={selectedAnalysis?.deduction ?? null} evidence={selectedAnalysis?.clause ?? null} onClose={() => setSelected(null)} />
  </section>;
}
