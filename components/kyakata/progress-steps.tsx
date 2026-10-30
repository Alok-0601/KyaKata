import { CheckIcon, FileTextIcon, ShieldCheckIcon, SparklesIcon } from "@/components/ui/icons";

const STEPS = [
  { title: "Upload documents", text: "Add your bill, letter and policy", icon: FileTextIcon },
  { title: "Analyze claim", text: "We connect the important details", icon: SparklesIcon },
  { title: "Understand deduction", text: "Ask in the language you prefer", icon: ShieldCheckIcon },
];

export function ProgressSteps({ documentsReady, hasConversation }: { documentsReady: boolean; hasConversation: boolean }) {
  const activeStep = hasConversation ? 3 : documentsReady ? 2 : 1;
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="How KyaKata works">
      {STEPS.map((step, index) => {
        const number = index + 1;
        const complete = number < activeStep;
        const active = number === activeStep;
        const StepIcon = step.icon;
        return <li key={step.title} className={`relative flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${active ? "border-[#0F766E] bg-[#E5F4F1] shadow-sm" : complete ? "border-[#b9dfd9] bg-white" : "border-slate-200 bg-white/70"}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-[#0F766E] text-white" : complete ? "bg-[#E5F4F1] text-[#0F766E]" : "bg-[#EEF2FF] text-[#5063a8]"}`}>{complete ? <CheckIcon size={18} /> : <StepIcon size={18} />}</span>
          <span><span className="block text-sm font-semibold text-[#14243A]">{number}. {step.title}</span><span className="mt-0.5 block text-xs leading-5 text-[#667085]">{step.text}</span></span>
        </li>;
      })}
    </ol>
  );
}
