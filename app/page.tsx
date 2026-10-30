"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MutableRefObject } from "react";
import { extractFromFile, extractFromUrl } from "@/lib/pdf";
import { blobToWav } from "@/lib/wav";
import type { DocKey, DocSet } from "@/lib/types";

type ChatRole = "user" | "assistant";
type ChatMessage = { id: string; role: ChatRole; text: string; streaming?: boolean };
type AnswerLanguage = "hinglish" | "en";

const SLOTS: { key: DocKey; label: string; hint: string; sample: string }[] = [
  { key: "bill", label: "Hospital bill", hint: "Itemised final bill", sample: "/samples/hospital-bill.pdf" },
  { key: "letter", label: "Settlement letter", hint: "Insurer's deduction explanation", sample: "/samples/settlement-letter.pdf" },
  { key: "policy", label: "Policy wording", hint: "Terms, limits and exclusions", sample: "/samples/policy-wording.pdf" },
];

const DEFAULT_QUESTION = "Mere hospital bill mein ₹28,000 deduct kyun hue? Policy mein iska reason diya hai?";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// Timbre v3.0 recognizes these exact inline tags. Keep them in the TTS text,
// but never expose them in the human-readable transcript.
const TIMBRE_AUDIO_TAG_PATTERN = /<(?:coughs|excited|exhales|giggle|laugh|pauses|shouting|sigh|slow|sniffles|whispers|yawns|clears throat)>/g;

function cleanConversationalText(value: string): string {
  // This cleanup deliberately preserves valid Timbre tags for synthesis.
  return value
      .replace(/\[(?:Hospital bill|Insurance settlement letter|Insurance policy wording),\s*p\.\s*\d+\]/gi, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/\*\*(.*?)\*\*/gs, "$1")
      .replace(/__(.*?)__/gs, "$1")
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/(^|\s)\*(?=\S)/g, "$1")
      .replace(/(?<=\S)\*(?=\s|$)/g, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
}

function cleanTranscriptText(value: string): string {
  return cleanConversationalText(value)
      .replace(TIMBRE_AUDIO_TAG_PATTERN, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([,.;!?।])/g, "$1")
      .replace(/<[^<>\n]{0,28}$/g, "") // Hide a tag while Gemini is still streaming its closing bracket.
      .trim();
}

function hasSpeakableWords(value: string): boolean {
  return cleanConversationalText(value).replace(TIMBRE_AUDIO_TAG_PATTERN, "").trim().length > 0;
}

function takeSpeakable(buffer: string): { sentences: string[]; rest: string } {
  // Release each complete sentence as soon as it arrives, rather than waiting for
  // several sentences or for the entire Gemini response.
  const parts = buffer.split(/(?<=[.!?।])\s+/u);
  if (parts.length > 1) {
    return {
      sentences: parts.slice(0, -1).map((part) => cleanConversationalText(part)).filter(hasSpeakableWords),
      rest: parts[parts.length - 1] || "",
    };
  }
  if (buffer.length > 220) {
    const cut = buffer.lastIndexOf(" ", 190);
    if (cut > 80) {
      const sentence = cleanConversationalText(buffer.slice(0, cut));
      return { sentences: hasSpeakableWords(sentence) ? [sentence] : [], rest: buffer.slice(cut + 1) };
    }
  }
  return { sentences: [], rest: buffer };
}

async function playBlob(blob: Blob, audioRef: MutableRefObject<HTMLAudioElement | null>, session: number, currentSession: () => number) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  try {
    if (session !== currentSession()) return;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
    if (audioRef.current === audio) audioRef.current = null;
  }
}

export default function Home() {
  const [docs, setDocs] = useState<DocSet>({});
  const [names, setNames] = useState<Partial<Record<DocKey, string>>>({});
  const [preview, setPreview] = useState<DocKey | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage>("hinglish");
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  // Timbre allows only one synthesis request at a time. Keep provider requests
  // serialized separately from audio playback so the next clip can be prepared
  // while the previous clip is playing, without overlapping API requests.
  const ttsRequestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const speechPendingRef = useRef(0);
  const voiceErrorRef = useRef<string | null>(null);
  const playbackSessionRef = useRef(0);
  const speechMutedForTurnRef = useRef(false);

  const ready = SLOTS.every((slot) => (docs[slot.key]?.length || 0) > 0);
  const loadedCount = SLOTS.filter((slot) => (docs[slot.key]?.length || 0) > 0).length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function stopSpeaking() {
    speechMutedForTurnRef.current = true;
    playbackSessionRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setVoiceStatus("Voice playback stopped");
  }

  function queueSpeech(rawText: string, language: "hi-en" | "en-IN") {
    const text = cleanConversationalText(rawText);
    if (speechMutedForTurnRef.current || !hasSpeakableWords(text)) return;

    const session = playbackSessionRef.current;
    speechPendingRef.current += 1;

    // IMPORTANT: enqueue the HTTP request itself. In the old implementation,
    // fetch() ran before this queue, so every sentence hit Timbre concurrently.
    // Timbre returns 429 when more than one synthesis request is active.
    const audioReady = ttsRequestQueueRef.current
        .catch(() => undefined)
        .then(async (): Promise<Blob | null> => {
          if (session !== playbackSessionRef.current || speechMutedForTurnRef.current) return null;

          setVoiceStatus("Preparing Shivani's voice…");
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, lang: language }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Timbre failed (${response.status})`);
          }

          return response.blob();
        });

    // Release the provider queue on both success and failure so one failed
    // sentence doesn't permanently block all later sentences.
    ttsRequestQueueRef.current = audioReady.then(() => undefined, () => undefined);

    // This second queue guarantees that audio is played in sentence order.
    // The next TTS request may finish while the current sentence is playing,
    // but the provider never receives overlapping synthesis requests.
    speechQueueRef.current = speechQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const blob = await audioReady;
          if (!blob || session !== playbackSessionRef.current || speechMutedForTurnRef.current) return;
          setVoiceStatus("Shivani is speaking…");
          await playBlob(blob, audioRef, session, () => playbackSessionRef.current);
        })
        .catch((reason: unknown) => {
          voiceErrorRef.current = reason instanceof Error ? reason.message : "Voice playback failed";
          setVoiceStatus(`Voice error: ${voiceErrorRef.current}`);
        })
        .finally(() => {
          speechPendingRef.current = Math.max(0, speechPendingRef.current - 1);
          if (session === playbackSessionRef.current && speechPendingRef.current === 0) {
            setVoiceStatus(voiceErrorRef.current ? `Voice error: ${voiceErrorRef.current}` : "Voice response finished");
          }
        });
  }

  async function loadFile(key: DocKey, file: File) {
    setError("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    try {
      setStatus(`Reading ${file.name} in your browser…`);
      const pages = await extractFromFile(file);
      if (!pages.some((page) => page.text.trim())) throw new Error("No selectable text found. This demo currently needs text-based PDFs, not scanned image PDFs.");
      setDocs((current) => ({ ...current, [key]: pages }));
      setNames((current) => ({ ...current, [key]: file.name }));
      setMessages([]);
      setStatus("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read that PDF.");
      setStatus("");
    }
  }

  async function loadSamples() {
    setError("");
    setStatus("Loading fictional sample documents…");
    try {
      const next: DocSet = {};
      const nextNames: Partial<Record<DocKey, string>> = {};
      for (const slot of SLOTS) {
        next[slot.key] = await extractFromUrl(slot.sample);
        nextNames[slot.key] = slot.sample.split("/").pop();
      }
      setDocs(next);
      setNames(nextNames);
      setMessages([]);
      setDraft(DEFAULT_QUESTION);
      setPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load fictional samples.");
    } finally {
      setStatus("");
    }
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || busy) return;
    if (!ready) {
      setError("Upload all three documents or use the fictional sample documents first.");
      return;
    }

    setError("");
    stopSpeaking();
    setVoiceStatus("");
    speechMutedForTurnRef.current = false;
    voiceErrorRef.current = null;
    setDraft("");
    setBusy(true);
    setStatus("Sending your question and document text to Gemini…");
    setVoiceStatus("");
    speechMutedForTurnRef.current = false;

    const history = messages.filter((item) => item.text.trim()).slice(-20).map((item) => ({ role: item.role, text: item.text }));
    const userId = newId();
    const assistantId = newId();
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text: message },
      { id: assistantId, role: "assistant", text: "", streaming: true },
    ]);

    const abortController = new AbortController();
    requestAbortRef.current = abortController;
    let answer = "";
    let speechBuffer = "";
    const ttsLanguage = answerLanguage === "en" ? "en-IN" : "hi-en";

    const appendAssistantText = (delta: string) => {
      answer += delta;
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: cleanTranscriptText(answer) } : item));
    };

    const handleSseBlock = (block: string) => {
      const data = block.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (!data) return;
      const payload = JSON.parse(data) as { type?: string; text?: string; error?: string };
      if (payload.type === "delta" && payload.text) {
        appendAssistantText(payload.text);
        if (speakAnswers) {
          speechBuffer += payload.text;
          const readyToSpeak = takeSpeakable(speechBuffer);
          speechBuffer = readyToSpeak.rest;
          readyToSpeak.sentences.forEach((sentence) => queueSpeech(sentence, ttsLanguage));
        }
      } else if (payload.type === "error") {
        throw new Error(payload.error || "Gemini streaming failed.");
      }
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, docs, history, answerLanguage }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Chat request failed (${response.status})`);
      }
      if (!response.body) throw new Error("Your browser did not expose the Gemini response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        for (const block of blocks) handleSseBlock(block);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleSseBlock(buffer);

      if (speakAnswers && hasSpeakableWords(speechBuffer)) queueSpeech(speechBuffer, ttsLanguage);
      if (!answer.trim()) throw new Error("Gemini returned no text. Check the selected model and your Gemini API quota.");
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, streaming: false } : item));
      setStatus("");
    } catch (reason) {
      const messageText = reason instanceof Error ? reason.message : "Could not complete the response.";
      if (answer.trim()) {
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: `${cleanTranscriptText(answer)}\n\nConnection interrupted: ${messageText}`, streaming: false } : item));
      } else {
        setMessages((current) => current.filter((item) => item.id !== assistantId));
      }
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(messageText);
      setStatus("");
    } finally {
      setBusy(false);
      requestAbortRef.current = null;
    }
  }

  async function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(draft);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  async function toggleMic() {
    setError("");
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!ready) {
      setError("Upload all three documents before starting the conversation.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        try {
          setStatus("Converting your recording and transcribing with Gnani Prisma…");
          setVoiceStatus("Transcribing with Prisma…");
          const wav = await blobToWav(new Blob(chunks, { type: recorder.mimeType }));
          const form = new FormData();
          form.append("audio", wav, "question.wav");
          form.append("lang", "hi-IN");
          const response = await fetch("/api/stt", { method: "POST", body: form });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `Prisma failed (${response.status})`);
          const transcript = String(payload.text || "").trim();
          if (!transcript) throw new Error("No speech was recognised. Try again or type your question.");
          setDraft(transcript);
          setStatus("");
          await sendMessage(transcript);
        } catch (reason) {
          setStatus("");
          setError(reason instanceof Error ? reason.message : "Voice transcription failed. You can type instead.");
        }
      };
      recRef.current = recorder;
      recorder.start();
      setRecording(true);
      setVoiceStatus("Listening… tap Stop when you finish speaking.");
    } catch {
      setError("Microphone permission was denied or the microphone is unavailable. You can type your question instead.");
    }
  }

  function clearConversation() {
    requestAbortRef.current?.abort();
    stopSpeaking();
    setMessages([]);
    setError("");
    setStatus("");
  }

  return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-700 text-lg font-bold text-white">K</div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">KyaKata?</h1>
                  <p className="text-sm text-slate-600">Understand your insurance deduction, in your language.</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Gemini reasoning · Gnani voice
            </div>
          </header>

          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            <strong>Fictional demo only.</strong> Use only synthetic PDFs. Do not upload real medical records, phone numbers, policy/account numbers, Aadhaar, PAN or recorded calls. PDFs are extracted in your browser; the extracted page text is sent to Gemini for this conversation.
          </div>

          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">1. Add your three documents</h2>
                <p className="text-xs text-slate-500">PDF text stays in the browser until you ask a question.</p>
              </div>
              <button onClick={loadSamples} disabled={busy} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
                Try fictional samples
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {SLOTS.map((slot) => (
                  <div key={slot.key} className={`rounded-xl border p-3 ${names[slot.key] ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{slot.label}</span>
                      <span className={`text-xs font-semibold ${names[slot.key] ? "text-emerald-700" : "text-slate-400"}`}>{names[slot.key] ? "Ready" : "Required"}</span>
                    </div>
                    <p className="mb-3 text-xs text-slate-500">{slot.hint}</p>
                    {names[slot.key] ? (
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                          <span className="max-w-[190px] truncate text-emerald-800">{names[slot.key]}</span>
                          <button className="shrink-0 font-medium text-indigo-700 underline" onClick={() => setPreview(preview === slot.key ? null : slot.key)}>
                            {preview === slot.key ? "Hide text" : "Preview"}
                          </button>
                        </div>
                    ) : null}
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={busy}
                        className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1.5 file:font-medium file:text-slate-700"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          if (file) void loadFile(slot.key, file);
                          event.currentTarget.value = "";
                        }}
                    />
                  </div>
              ))}
            </div>
            {preview && docs[preview] ? (
                <div className="mt-3 max-h-64 overflow-auto rounded-xl border bg-slate-50 p-3 text-xs">
                  {docs[preview]!.map((page) => (
                      <div key={page.page} className="mb-3 last:mb-0">
                        <div className="mb-1 font-semibold text-slate-500">Page {page.page}</div>
                        <pre className="whitespace-pre-wrap font-sans text-slate-700">{page.text}</pre>
                      </div>
                  ))}
                </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{loadedCount}/3 documents loaded</span>
              <span>{ready ? "Documents ready for questions" : "Upload all three to start"}</span>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h2 className="font-semibold">2. Talk to KyaKata</h2>
                <p className="text-xs text-slate-500">Speak naturally or type. Gemini reads your documents and streams its answer.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={speakAnswers} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSpeakAnswers(event.target.checked); if (!event.target.checked) stopSpeaking(); }} />
                  Speak answers
                </label>
                <button onClick={clearConversation} className="text-xs font-medium text-slate-500 underline hover:text-slate-800">Clear chat</button>
              </div>
            </div>

            <div className="min-h-[300px] max-h-[58vh] space-y-4 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:px-5">
              {messages.length === 0 ? (
                  <div className="mx-auto flex max-w-md flex-col items-center py-8 text-center">
                    <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-indigo-100 text-3xl">🎙️</div>
                    <h3 className="font-semibold">Your documents are ready for a conversation</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Ask why a deduction happened, point to a policy clause, or ask what information is still missing.</p>
                    <button onClick={() => setDraft(DEFAULT_QUESTION)} disabled={!ready} className="mt-4 rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                      Try: “₹28,000 kyun deduct hue?”
                    </button>
                  </div>
              ) : messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[82%] ${message.role === "user" ? "rounded-br-md bg-indigo-700 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
                      <div className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${message.role === "user" ? "text-indigo-200" : "text-indigo-700"}`}>
                        {message.role === "user" ? "You · transcript" : "KyaKata · Gemini"}
                      </div>
                      <p className="whitespace-pre-wrap">{cleanTimbreClosingTags(message.text) || (message.streaming ? "Thinking…" : "")}</p>
                      {message.streaming ? <span className="mt-1 inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" /> : null}
                    </div>
                  </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 text-slate-600">
                  Answer language
                  <select value={answerLanguage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAnswerLanguage(event.target.value as AnswerLanguage)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                    <option value="hinglish">Hinglish</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <span className="text-slate-500">{voiceStatus || (recording ? "Recording" : "Prisma STT · Gemini · Timbre")}</span>
              </div>

              <form onSubmit={submitText} className="flex flex-col gap-3">
              <textarea
                  value={draft}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  rows={2}
                  disabled={!ready || busy}
                  placeholder={ready ? "Type a follow-up question… (Enter to send, Shift+Enter for a new line)" : "Upload all three documents first…"}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
              />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                      type="button"
                      onClick={() => void toggleMic()}
                      disabled={!ready || busy}
                      className={`rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${recording ? "animate-pulse bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800"}`}
                  >
                    {recording ? "■ Stop recording" : "🎙️ Tap to talk"}
                  </button>
                  <button type="submit" disabled={!ready || busy || !draft.trim()} className="rounded-full bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-40">
                    {busy ? "Thinking…" : "Send question ↗"}
                  </button>
                  {busy ? <button type="button" onClick={() => requestAbortRef.current?.abort()} className="rounded-full border px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">Stop generating</button> : null}
                  {voiceStatus.includes("speaking") ? (
                      <button type="button" onClick={stopSpeaking} className="rounded-full border px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">Stop voice</button>
                  ) : null}
                </div>
              </form>
              {status ? <p className="mt-3 text-xs text-slate-500">{status}</p> : null}
              {error ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
            </div>
          </section>

          <footer className="mt-5 text-center text-xs leading-5 text-slate-400">
            KyaKata is a document-explanation demo, not an insurer, broker or legal adviser. Answers must be checked against the original policy and settlement records.
          </footer>
        </div>
      </main>
  );
}

function cleanTimbreClosingTags(text: string): string {
  return text.replace(
      /<\/\s*(?:coughs|excited|exhales|giggle|laugh|pauses|shouting|sigh|slow|sniffles|whispers|yawns|clears\s+throat)\s*>/gi,
      ""
  );
}