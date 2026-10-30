"use client";

import { useEffect } from "react";
import { FileTextIcon, InfoIcon, ShieldCheckIcon, XIcon } from "@/components/ui/icons";
import type { ClauseEvidence, Deduction } from "@/lib/types";

function clauseNumber(text: string) {
  return text.match(/^\s*(\d+(?:\.\d+)*)\.?\s/m)?.[1] ?? "Policy provision";
}

function relevantTerms(value: string) {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 3) ?? [])].slice(0, 5);
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = relevantTerms(query);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "giu"));
  return <>{parts.map((part, index) => terms.includes(part.toLowerCase()) ? <mark key={index} className="rounded bg-[#bfeee5] px-0.5 text-[#14243A]">{part}</mark> : part)}</>;
}

interface Props {
  deduction: Deduction | null;
  evidence: ClauseEvidence | null;
  onClose: () => void;
}

export function PolicyEvidenceViewer({ deduction, evidence, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!deduction) return null;
  const provision = evidence ? clauseNumber(evidence.quote) : null;
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-[0_-18px_50px_rgba(20,36,58,0.2)] motion-safe:animate-[message-entry_220ms_ease-out] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[30rem] sm:rounded-none sm:border-y-0 sm:border-r-0 sm:p-6" role="dialog" aria-modal="false" aria-labelledby="policy-evidence-heading">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#E5F4F1] text-[#0F766E]"><FileTextIcon size={19} /></span><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0F766E]">Policy evidence</p><h2 id="policy-evidence-heading" className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#14243A]">{provision ?? "Evidence not found"}</h2></div></div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-[#667085] transition hover:bg-slate-50 hover:text-[#14243A] focus:outline-none focus:ring-2 focus:ring-[#0F766E]" aria-label="Close policy evidence"><XIcon size={18} /></button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-[#F7F8FA] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#667085]">Deduction under review</p><p className="mt-2 text-sm font-semibold leading-6 text-[#14243A]">{deduction.label}</p><p className="mt-1 text-xs text-[#667085]">Stated on settlement letter page {deduction.page}</p></div>

      {evidence ? <>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-slate-100 p-3"><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#667085]">Source</dt><dd className="mt-1 font-semibold text-[#14243A]">Insurance policy wording</dd></div><div className="rounded-xl border border-slate-100 p-3"><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#667085]">Page</dt><dd className="mt-1 font-semibold text-[#14243A]">Page {evidence.page}</dd></div></dl>
        <div className="mt-5"><p className="flex items-center gap-2 text-sm font-bold text-[#14243A]"><ShieldCheckIcon size={17} className="text-[#0F766E]" />Exact extracted policy text</p><blockquote className="mt-3 whitespace-pre-wrap rounded-2xl border border-[#d6ece8] bg-[#f5fcfa] p-4 text-sm leading-7 text-[#344a5d]"><HighlightedText text={evidence.quote} query={deduction.label} /></blockquote></div>
        <p className="mt-4 text-xs leading-5 text-[#667085]">Highlighted words are search matches only. Read the full provision before deciding how it applies to the claim.</p>
      </> : <div className="mt-5 rounded-2xl border border-[#dfe5f5] bg-[#EEF2FF] p-4 text-sm leading-6 text-[#5063a8]"><InfoIcon className="mr-2 inline" size={16} />No matching policy provision was found in the extracted policy text for this deduction. Ask the insurer to identify the exact clause and page used.</div>}
    </aside>
  );
}
