import type { ChangeEvent, DragEvent } from "react";
import { CheckIcon, FileTextIcon, UploadIcon, XIcon } from "@/components/ui/icons";
import type { DocKey } from "@/lib/types";

interface Props {
  slot: { key: DocKey; label: string; hint: string };
  fileName?: string;
  fileSize?: number;
  error?: string;
  loading?: boolean;
  busy: boolean;
  previewing: boolean;
  onPreview: () => void;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "Sample document";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUploadCard({ slot, fileName, fileSize, error, loading, busy, previewing, onPreview, onFileSelected, onRemove }: Props) {
  const ready = Boolean(fileName);
  const disabled = busy && !loading;
  const acceptFile = (file?: File) => { if (file) onFileSelected(file); };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!disabled && !loading) acceptFile(event.dataTransfer.files?.[0]); };
  return <article className={`group relative overflow-hidden rounded-2xl border p-4 transition duration-200 sm:p-5 ${ready ? "upload-success border-[#b7dfd8] bg-[#f5fcfa]" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#9bcfc6] hover:shadow-md"}`}>
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl ${ready ? "bg-[#0F766E] text-white" : "bg-[#EEF2FF] text-[#5063a8]"}`}><FileTextIcon size={21} /></div>
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${ready ? "bg-[#E5F4F1] text-[#0F766E]" : "bg-slate-100 text-[#667085]"}`}>{ready ? <CheckIcon size={13} /> : null}{ready ? "Ready" : "Required"}</span>
    </div>
    <h3 className="font-semibold text-[#14243A]">{slot.label}</h3>
    <p className="mt-1 min-h-10 text-xs leading-5 text-[#667085]">{slot.hint}</p>
    {loading ? <div className="mt-4 rounded-xl border border-[#cfe7e2] bg-white p-3" aria-live="polite"><div className="flex items-center gap-2 text-xs font-bold text-[#0F766E]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0F766E] border-t-transparent" />Reading your PDF securely…</div><p className="mt-2 text-[11px] leading-4 text-[#667085]">Processing is shown while text is being extracted.</p><div className="mt-3 space-y-2"><div className="h-2 w-full animate-pulse rounded bg-slate-100" /><div className="h-2 w-3/5 animate-pulse rounded bg-slate-100" /></div></div> : ready ? <div className="mt-4 rounded-xl border border-[#d6ece8] bg-white px-3 py-3"><div className="flex gap-2"><CheckIcon size={16} className="mt-0.5 shrink-0 text-[#0F766E]" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[#14243A]">{fileName}</p><p className="mt-0.5 text-[11px] text-[#667085]">{formatFileSize(fileSize)} · PDF processed</p></div></div><div className="mt-3 flex items-center gap-3"><button type="button" onClick={onPreview} className="text-xs font-bold text-[#0F766E] hover:text-[#095f58]">{previewing ? "Hide text" : "Preview text"}</button><button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs font-bold text-[#667085] hover:text-rose-700"><XIcon size={13} />Remove</button></div></div> : <div className="mt-4 min-h-[98px] rounded-xl border border-dashed border-slate-300 bg-[#F7F8FA] p-3 text-center transition hover:border-[#0F766E] hover:bg-[#E5F4F1]" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><UploadIcon size={18} className="mx-auto text-[#0F766E]" /><p className="mt-2 text-xs font-bold text-[#14243A]">Drop your PDF here</p><p className="mt-1 text-[11px] text-[#667085]">or browse from your device</p></div>}
    {error ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] leading-4 text-rose-800">{error}</p> : null}
    <label className={`mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${ready ? "border-[#b9dfd9] bg-white text-[#0F766E] hover:bg-[#E5F4F1]" : "border-[#0F766E] bg-[#0F766E] text-white hover:bg-[#095f58]"} ${(disabled || loading) ? "pointer-events-none opacity-50" : ""}`}><UploadIcon size={16} />{ready ? "Replace file" : "Browse files"}<input type="file" accept="application/pdf,.pdf" disabled={disabled || loading} className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => { acceptFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    <p className="mt-2 text-center text-[10px] font-medium text-[#667085]">Accepted format: PDF</p>
  </article>;
}
