import { CopyIcon, MicIcon, PauseIcon, PlayIcon, ReplayIcon, SparklesIcon } from "@/components/ui/icons";

interface Props {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  isSpeaking?: boolean;
  onListen?: () => void;
  onStopAudio?: () => void;
  onReplay?: () => void;
  onCopy?: () => void;
}

export function ChatMessage({ role, text, streaming, isSpeaking, onListen, onStopAudio, onReplay, onCopy }: Props) {
  const assistant = role === "assistant";
  return (
    <article className={`message-entry flex gap-3 ${assistant ? "justify-start" : "justify-end"}`} aria-live={assistant ? "polite" : undefined}>
      <div className={`flex w-full max-w-[96%] gap-3 sm:max-w-[84%] ${assistant ? "flex-row" : "flex-row-reverse"}`}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl shadow-sm ${assistant ? "bg-[#E5F4F1] text-[#0F766E]" : "bg-[#14243A] text-white"}`}>
          {assistant ? <SparklesIcon size={17} /> : <MicIcon size={17} />}
        </span>
        <div className={`min-w-0 flex-1 rounded-2xl px-4 py-3.5 text-sm leading-7 shadow-sm ${assistant ? "rounded-tl-md border border-slate-200 bg-white text-[#14243A]" : "rounded-tr-md bg-[#14243A] text-white"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-[10px] font-bold uppercase tracking-[0.13em] ${assistant ? "text-[#0F766E]" : "text-slate-300"}`}>
              {assistant ? "KyaKata guide" : "Your question"}
            </p>
            {assistant && isSpeaking ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#0F766E]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0F766E]" />Speaking</span> : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{text || (streaming ? "Looking through your documents…" : "")}</p>
          {streaming ? <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#E5F4F1] px-2.5 py-1 text-[11px] font-bold text-[#0F766E]"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E] [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E] [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E]" />Preparing your answer</span> : null}
          {assistant && !streaming && text ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={onListen} className="inline-flex items-center gap-1.5 rounded-lg bg-[#E5F4F1] px-2.5 py-1.5 text-[11px] font-bold text-[#0F766E] transition hover:bg-[#d6eee9]"><PlayIcon size={13} />Listen</button>
              {isSpeaking ? <button type="button" onClick={onStopAudio} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-[#667085] transition hover:bg-slate-50"><PauseIcon size={13} />Stop audio</button> : null}
              <button type="button" onClick={onReplay} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-[#667085] transition hover:bg-slate-50"><ReplayIcon size={13} />Replay</button>
              <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-[#667085] transition hover:bg-slate-50"><CopyIcon size={13} />Copy explanation</button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
