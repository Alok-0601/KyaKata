"use client";

import { useRef, useState } from "react";
import { extractFromFile, extractFromUrl } from "@/lib/pdf";
import { blobToWav } from "@/lib/wav";
import type { DocKey, DocSet, ExplainResult, Status } from "@/lib/types";

const SLOTS: { key: DocKey; label: string; hint: string; sample: string }[] = [
  { key: "bill", label: "Hospital bill", hint: "Itemised final bill", sample: "/samples/hospital-bill.pdf" },
  { key: "letter", label: "Settlement letter", hint: "Letter showing the deduction", sample: "/samples/settlement-letter.pdf" },
  { key: "policy", label: "Policy wording", hint: "Terms and conditions", sample: "/samples/policy-wording.pdf" },
];

const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  partly: { label: "Partly verified", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  cannot_verify: { label: "Cannot verify", cls: "bg-rose-100 text-rose-800 border-rose-300" },
};

const DEFAULT_Q = "Mere insurance mein kamre ke kiraye ki katauti kyu hui?";

export default function Home() {
  const [docs, setDocs] = useState<DocSet>({});
  const [names, setNames] = useState<Partial<Record<DocKey, string>>>({});
  const [preview, setPreview] = useState<DocKey | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [lang, setLang] = useState<"hinglish" | "en">("hinglish");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const ready = SLOTS.every((s) => docs[s.key]?.length);

  async function loadFile(key: DocKey, file: File) {
    setError(null);
    try {
      setBusy(`Reading ${file.name}…`);
      const pages = await extractFromFile(file);
      if (!pages.some((p) => p.text.trim())) throw new Error("No text found. Use a text PDF, not a scan.");
      setDocs((d) => ({ ...d, [key]: pages }));
      setNames((n) => ({ ...n, [key]: file.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that PDF");
    } finally {
      setBusy(null);
    }
  }

  async function loadSamples() {
    setError(null);
    setBusy("Loading sample documents…");
    try {
      const next: DocSet = {};
      const nm: Partial<Record<DocKey, string>> = {};
      for (const s of SLOTS) {
        next[s.key] = await extractFromUrl(s.sample);
        nm[s.key] = s.sample.split("/").pop();
      }
      setDocs(next);
      setNames(nm);
      setQuestion((q) => q || DEFAULT_Q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load samples");
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    setError(null);
    setResult(null);
    if (!question.trim()) return setError("Type or speak a question first.");
    if (!ready) return setError("Add all three documents first (or use the sample documents).");
    setBusy("Checking your documents…");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, docs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setResult(json as ExplainResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function toggleMic() {
    setError(null);
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        try {
          setBusy("Listening to your question…");
          const wav = await blobToWav(new Blob(chunksRef.current, { type: rec.mimeType }));
          const fd = new FormData();
          fd.append("audio", wav, "question.wav");
          const res = await fetch("/api/stt", { method: "POST", body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Transcription failed");
          setQuestion(json.text);
        } catch (e) {
          setError((e instanceof Error ? e.message : "Voice failed") + " You can type your question instead.");
        } finally {
          setBusy(null);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone not available. You can type your question instead.");
    }
  }

  async function listen() {
    if (!result) return;
    setError(null);
    setBusy("Preparing audio…");
    try {
      const text = lang === "hinglish" ? result.answerHinglish : result.answerEn;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Audio failed");
      const url = URL.createObjectURL(await res.blob());
      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;
      await a.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play audio");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">KyaKata</h1>
        <p className="mt-1 text-slate-600">Why was money deducted from my claim? Ask in Hindi, Hinglish or English.</p>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Demo uses fictional documents only. Do not upload real personal, policy or account details. PDFs are read in
          your browser; only the extracted text is sent for the explanation.
        </p>
      </header>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">1. Documents</h2>
          <button onClick={loadSamples} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Try with sample documents
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {SLOTS.map((s) => (
            <div key={s.key} className="rounded-lg border bg-white p-3">
              <div className="text-sm font-medium">{s.label}</div>
              <div className="mb-2 text-xs text-slate-500">{s.hint}</div>
              {names[s.key] ? (
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-emerald-700">✓ {names[s.key]}</span>
                  <button className="shrink-0 text-indigo-600 underline" onClick={() => setPreview(preview === s.key ? null : s.key)}>
                    {preview === s.key ? "Hide" : "Preview"}
                  </button>
                </div>
              ) : null}
              <input
                type="file"
                accept="application/pdf"
                className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1"
                onChange={(e) => e.target.files?.[0] && loadFile(s.key, e.target.files[0])}
              />
            </div>
          ))}
        </div>
        {preview && docs[preview] ? (
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border bg-white p-3 text-xs">
            {docs[preview]!.map((p) => (
              <div key={p.page} className="mb-3">
                <div className="mb-1 font-semibold text-slate-500">Page {p.page}</div>
                <pre className="whitespace-pre-wrap font-sans">{p.text}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-semibold">2. Ask your question</h2>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder={DEFAULT_Q}
          className="w-full rounded-lg border bg-white p-3 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={toggleMic}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${recording ? "bg-rose-600 animate-pulse" : "bg-slate-800 hover:bg-slate-900"}`}
          >
            {recording ? "■ Stop recording" : "🎤 Speak"}
          </button>
          <button onClick={ask} disabled={!!busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            Explain my deduction
          </button>
        </div>
      </section>

      {busy ? <p className="mb-4 text-sm text-slate-600">{busy}</p> : null}
      {error ? <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      {result ? <Answer result={result} lang={lang} setLang={setLang} onListen={listen} busy={!!busy} /> : null}
    </main>
  );
}

function Answer({
  result,
  lang,
  setLang,
  onListen,
  busy,
}: {
  result: ExplainResult;
  lang: "hinglish" | "en";
  setLang: (l: "hinglish" | "en") => void;
  onListen: () => void;
  busy: boolean;
}) {
  const st = STATUS_UI[result.status];
  return (
    <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
        <div className="flex items-center gap-2 text-sm">
          <select value={lang} onChange={(e) => setLang(e.target.value as "hinglish" | "en")} className="rounded border px-2 py-1">
            <option value="hinglish">Hinglish</option>
            <option value="en">English</option>
          </select>
          <button onClick={onListen} disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 font-medium text-white disabled:opacity-50">
            🔊 Listen
          </button>
        </div>
      </div>

      <p className="text-base">{lang === "hinglish" ? result.answerHinglish : result.answerEn}</p>

      {result.clause ? (
        <blockquote className="rounded-md border-l-4 border-indigo-400 bg-indigo-50 p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase text-indigo-700">
            Policy clause · page {result.clause.page}
          </div>
          <pre className="whitespace-pre-wrap font-sans">{result.clause.quote}</pre>
        </blockquote>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-emerald-700">What we know</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{result.known.map((k) => <li key={k}>{k}</li>)}</ul>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-rose-700">What is missing</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.missing.length ? result.missing.map((k) => <li key={k}>{k}</li>) : <li>Nothing missing.</li>}
          </ul>
        </div>
      </div>

      {result.scenarios.length ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Checks we tried</h3>
          <ul className="space-y-1 text-sm">
            {result.scenarios.map((s) => (
              <li key={s.name}>
                {s.matches ? "✅" : "❌"} {s.name}: Rs. {s.amount.toLocaleString("en-IN")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Ask your insurer</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{result.nextQuestions.map((q) => <li key={q}>{q}</li>)}</ol>
      </div>
    </section>
  );
}
