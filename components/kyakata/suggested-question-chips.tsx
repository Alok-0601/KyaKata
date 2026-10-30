import { ArrowUpRightIcon, SparklesIcon } from "@/components/ui/icons";

export interface SuggestedQuestion {
  text: string;
  reason?: string;
}

interface Props {
  questions: SuggestedQuestion[];
  disabled?: boolean;
  ready: boolean;
  onSelect: (question: string) => void;
}

/** A compact, evidence-aware starting point for a real chat request. */
export function SuggestedQuestionChips({ questions, disabled, ready, onSelect }: Props) {
  return (
    <section aria-labelledby="suggested-questions-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p id="suggested-questions-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-[#667085]">
            Suggested questions
          </p>
          <p className="mt-1 text-xs leading-5 text-[#667085]">
            {ready ? "Chosen from the evidence currently found in your documents." : "Available after all three documents are ready."}
          </p>
        </div>
        {ready ? <SparklesIcon size={17} className="shrink-0 text-[#0F766E]" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question.text}
            type="button"
            disabled={disabled || !ready}
            onClick={() => onSelect(question.text)}
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-[#14243A] shadow-sm transition hover:-translate-y-0.5 hover:border-[#0F766E] hover:bg-[#f5fcfa] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="min-w-0 truncate">{question.text}</span>
            <ArrowUpRightIcon size={14} className="shrink-0 text-[#0F766E] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        ))}
      </div>

      {ready && questions.some((question) => question.reason) ? (
        <p className="mt-3 text-[11px] leading-5 text-[#667085]">{questions.find((question) => question.reason)?.reason}</p>
      ) : null}
    </section>
  );
}
