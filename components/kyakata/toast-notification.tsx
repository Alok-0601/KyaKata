"use client";

import { CheckIcon, XIcon } from "@/components/ui/icons";

export function ToastNotification({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-5 right-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-[#b9dfd9] bg-white px-4 py-3 text-sm font-semibold text-[#14243A] shadow-[0_18px_45px_rgba(20,36,58,0.2)] motion-safe:animate-[message-entry_220ms_ease-out] sm:right-6" role="status" aria-live="polite">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E5F4F1] text-[#0F766E]"><CheckIcon size={15} /></span>
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-[#667085] transition hover:bg-slate-100 hover:text-[#14243A] focus:outline-none focus:ring-2 focus:ring-[#0F766E]" aria-label="Dismiss notification"><XIcon size={16} /></button>
    </div>
  );
}
