import { SparklesIcon } from "@/components/ui/icons";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#14243A] text-white shadow-[0_8px_20px_rgba(20,36,58,0.18)]">
        <SparklesIcon size={19} />
      </div>
      {!compact ? <div><p className="text-base font-bold tracking-[-0.03em] text-[#14243A]">KyaKata</p><p className="text-[11px] font-medium text-[#667085]">Insurance, made clear</p></div> : null}
    </div>
  );
}
