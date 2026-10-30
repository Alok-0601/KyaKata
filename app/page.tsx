"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MutableRefObject } from "react";
import { extractFromFile, extractFromUrl } from "@/lib/pdf";
import { blobToWav } from "@/lib/wav";
import type { DocKey, DocSet } from "@/lib/types";
import { findClause } from "@/lib/retrieve";
import { parseDeductions, verify } from "@/lib/verify";
import { AnalysisPanel } from "@/components/kyakata/analysis-panel";
import { AIAvatar, type AIAvatarState } from "@/components/kyakata/ai-avatar";
import { AudioWaveform, primeAudioWaveform, type AudioWaveformMode } from "@/components/kyakata/audio-waveform";
import { BrandMark } from "@/components/kyakata/brand";
import { ChatMessage } from "@/components/kyakata/chat-message";
import { ClaimDashboard } from "@/components/kyakata/claim-dashboard";
import { DocumentUploadCard } from "@/components/kyakata/document-upload-card";
import { ProgressSteps } from "@/components/kyakata/progress-steps";
import { SuggestedQuestionChips } from "@/components/kyakata/suggested-question-chips";
import { ToastNotification } from "@/components/kyakata/toast-notification";
import { ArrowUpRightIcon, ChevronDownIcon, InfoIcon, MicIcon, PauseIcon, ShieldCheckIcon, SparklesIcon, VolumeIcon, XIcon } from "@/components/ui/icons";

type ChatRole = "user" | "assistant";
type ChatMessage = { id: string; role: ChatRole; text: string; streaming?: boolean };
type AnswerLanguage = "hinglish" | "hi" | "en";

const SLOTS: { key: DocKey; label: string; hint: string; sample: string }[] = [
  { key: "bill", label: "Hospital bill", hint: "Itemised final bill", sample: "/samples/hospital-bill.pdf" },
  { key: "letter", label: "Settlement letter", hint: "Insurer's deduction explanation", sample: "/samples/settlement-letter.pdf" },
  { key: "policy", label: "Policy wording", hint: "Terms, limits and exclusions", sample: "/samples/policy-wording.pdf" },
];

const DEFAULT_QUESTION = "Mere hospital bill mein ₹28,000 deduct kyun hue? Policy mein iska reason diya hai?";
const WELCOME_MESSAGE = "Namaste! I'm KyaKata.\n\nI can help you understand your insurance deductions, find relevant policy clauses and identify what you should ask your insurer.";

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

async function playBlob(
  blob: Blob,
  audioRef: MutableRefObject<HTMLAudioElement | null>,
  session: number,
  currentSession: () => number,
  onPlaybackStart: (audio: HTMLAudioElement) => void,
  onPlaybackEnd: (audio: HTMLAudioElement) => void,
) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  try {
    if (session !== currentSession()) return;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      audio.play().then(() => {
        if (session === currentSession()) onPlaybackStart(audio);
      }).catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
    if (audioRef.current === audio) audioRef.current = null;
    onPlaybackEnd(audio);
  }
}

export default function Home() {
  const [docs, setDocs] = useState<DocSet>({});
  const [names, setNames] = useState<Partial<Record<DocKey, string>>>({});
  const [fileSizes, setFileSizes] = useState<Partial<Record<DocKey, number>>>({});
  const [documentErrors, setDocumentErrors] = useState<Partial<Record<DocKey, string>>>({});
  const [loadingDocument, setLoadingDocument] = useState<DocKey | null>(null);
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
  const [copyStatus, setCopyStatus] = useState("");
  const [toast, setToast] = useState("");
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = SLOTS.every((slot) => (docs[slot.key]?.length || 0) > 0);
  const loadedCount = SLOTS.filter((slot) => (docs[slot.key]?.length || 0) > 0).length;
  const detectedDeduction = ready ? parseDeductions(docs.letter)[0] ?? null : null;
  const detectedClause = detectedDeduction ? findClause(detectedDeduction.label, "policy", docs.policy) : null;
  const detectedVerification = ready ? verify(detectedDeduction, Boolean(detectedClause), docs) : null;
  const isRoomRentDeduction = /room|rent|proportion/i.test(detectedDeduction?.label || "");
  const waveformMode: AudioWaveformMode = recording ? "listening" : playingAudio ? "speaking" : "idle";
  // This is deliberately derived from the same state that already drives the
  // recorder, request lifecycle, and real audio element. The avatar therefore
  // cannot continue "speaking" once playback is paused, stopped, or finished.
  const avatarState: AIAvatarState = error || Object.values(documentErrors).some(Boolean)
    ? "error"
    : playingAudio
      ? "speaking"
      : recording
        ? "listening"
        : busy || loadingDocument !== null || /^(Transcribing|Preparing)/.test(voiceStatus)
          ? "thinking"
          : "idle";
  const suggestedQuestions = [
    {
      text: "Why was my room rent reduced?",
      priority: isRoomRentDeduction ? 4 : 0,
      reason: isRoomRentDeduction ? "Room-rent wording was detected in your settlement letter." : undefined,
    },
    {
      text: "Which policy clause applies?",
      priority: detectedClause ? 4 : 1,
      reason: detectedClause ? `A potentially relevant policy clause was found on page ${detectedClause.page}.` : undefined,
    },
    {
      text: "How was this deduction calculated?",
      priority: detectedVerification?.scenarios.some((scenario) => scenario.matches) ? 4 : detectedVerification?.scenarios.length ? 3 : 2,
      reason: detectedVerification?.scenarios.some((scenario) => scenario.matches)
        ? "The document figures match one of the available calculation checks."
        : detectedVerification?.scenarios.length ? "The app found figures worth checking against the deduction." : undefined,
    },
    {
      text: "What information is missing?",
      priority: detectedVerification?.missing.length ? 5 : 1,
      reason: detectedVerification?.missing.length ? "Some details needed to confirm the deduction were not found in the uploaded text." : undefined,
    },
    { text: "What should I ask my insurer?", priority: 1 },
  ].filter((question) => question.priority > 0).sort((a, b) => b.priority - a.priority);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      if (recRef.current?.state !== "inactive") recRef.current?.stop();
      audioRef.current?.pause();
      microphoneStream?.getTracks().forEach((track) => track.stop());
    };
  }, [microphoneStream]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3600);
  }

  function stopSpeaking() {
    speechMutedForTurnRef.current = true;
    playbackSessionRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingAudio(null);
    setVoiceStatus("Voice playback stopped");
  }

  function listenToAnswer(text: string) {
    if (!text.trim()) return;
    void primeAudioWaveform();
    stopSpeaking();
    speechMutedForTurnRef.current = false;
    voiceErrorRef.current = null;
    setVoiceStatus("Preparing the answer to play…");
    queueSpeech(text, answerLanguage === "en" ? "en-IN" : "hi-en");
  }

  async function copyExplanation(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Explanation copied");
      showToast("Explanation copied to your clipboard");
    } catch {
      setCopyStatus("Could not copy the explanation. Please select and copy it manually.");
    }
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
          setVoiceStatus("KyaKata is speaking...");
          await playBlob(
            blob,
            audioRef,
            session,
            () => playbackSessionRef.current,
            setPlayingAudio,
            (audio) => setPlayingAudio((current) => current === audio ? null : current),
          );
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
    setDocumentErrors((current) => ({ ...current, [key]: "" }));
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setDocumentErrors((current) => ({ ...current, [key]: "Please choose a PDF file. Other formats are not supported yet." }));
      return;
    }
    try {
      setLoadingDocument(key);
      setStatus(`Reading ${file.name} in your browser…`);
      const pages = await extractFromFile(file);
      if (!pages.some((page) => page.text.trim())) throw new Error("No selectable text found. This demo currently needs text-based PDFs, not scanned image PDFs.");
      setDocs((current) => ({ ...current, [key]: pages }));
      setNames((current) => ({ ...current, [key]: file.name }));
      setFileSizes((current) => ({ ...current, [key]: file.size }));
      setMessages([]);
      setStatus("");
    } catch (reason) {
      setDocumentErrors((current) => ({ ...current, [key]: reason instanceof Error ? reason.message : "We could not read that PDF. Please try another file." }));
      setStatus("");
    } finally {
      setLoadingDocument(null);
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
      setFileSizes({});
      setDocumentErrors({});
      setMessages([]);
      setDraft(DEFAULT_QUESTION);
      setPreview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load fictional samples.");
    } finally {
      setStatus("");
    }
  }

  function removeFile(key: DocKey) {
    setDocs((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNames((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFileSizes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setDocumentErrors((current) => ({ ...current, [key]: "" }));
    if (preview === key) setPreview(null);
    setMessages([]);
    setStatus("");
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || busy) return;
    if (!ready) {
      setError("Upload all three documents or use the fictional sample documents first.");
      return;
    }

    void primeAudioWaveform();
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
      await primeAudioWaveform();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophoneStream(stream);
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setMicrophoneStream(null);
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
          setVoiceStatus("Transcription ready — review or edit it, then send.");
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

  return <main className="min-h-screen overflow-x-hidden bg-[#F7F8FA] text-[#14243A]">
    <nav className="border-b border-slate-200/80 bg-white/95" aria-label="Main navigation">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"><BrandMark /><div className="flex items-center gap-2 sm:gap-3"><a href="#how-it-works" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#14243A] sm:inline-flex">How it works</a><a href="#assistant" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#14243A] sm:inline-flex">Help</a><label className="relative"><span className="sr-only">Answer language</span><select value={answerLanguage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAnswerLanguage(event.target.value as AnswerLanguage)} className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-semibold text-[#14243A] outline-none transition focus:border-[#0F766E] focus:ring-2 focus:ring-[#E5F4F1]"><option value="hinglish">Hinglish</option><option value="hi">Hindi</option><option value="en">English</option></select><ChevronDownIcon size={14} className="pointer-events-none absolute right-2 top-2.5 text-[#667085]" /></label></div></div>
    </nav>

    <div className="mx-auto max-w-7xl px-4 pb-10 pt-7 sm:px-6 sm:pt-10 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl bg-[#14243A] px-6 py-9 text-white shadow-[0_20px_50px_rgba(20,36,58,0.18)] sm:px-10 sm:py-12"><div className="absolute -right-28 -top-32 h-72 w-72 rounded-full bg-[#0F766E]/25 blur-3xl" /><div className="absolute bottom-0 left-1/3 h-32 w-80 rounded-full bg-[#5063a8]/20 blur-3xl" /><div className="relative grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#d5f0eb]"><ShieldCheckIcon size={15} /> Built for clearer claim conversations</span><h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-[-0.055em] sm:text-5xl lg:text-6xl">Understand your insurance. <span className="text-[#9fe1d6]">Own your answers.</span></h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">Upload your documents, ask questions in your language, and understand every deduction with evidence.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#E5F4F1] text-[#0F766E]"><ShieldCheckIcon size={20} /></div><div><p className="text-sm font-bold">Your documents stay in your flow</p><p className="mt-0.5 text-xs leading-5 text-slate-300">PDFs are read in your browser. Only extracted text is sent when you ask a question.</p></div></div></div></div></section>

      <section id="how-it-works" className="mt-6"><ProgressSteps documentsReady={ready} hasConversation={messages.length > 0} /></section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr] xl:items-start">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="documents-heading"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0F766E]">Step 1 of 3</p><h2 id="documents-heading" className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#14243A]">Add the documents behind your claim</h2><p className="mt-1 text-sm leading-6 text-[#667085]">Use the final bill, settlement letter, and policy wording.</p></div><button type="button" onClick={loadSamples} disabled={busy || loadingDocument !== null} className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#095f58] focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><SparklesIcon size={16} />Try fictional samples</button></div><div className="mt-5 flex gap-2 rounded-2xl border border-[#d6ece8] bg-[#f5fcfa] px-3.5 py-3 text-xs leading-5 text-[#526d6a]"><InfoIcon size={16} className="mt-0.5 shrink-0 text-[#0F766E]" /><span><strong className="text-[#14243A]">Fictional demo only.</strong> Use synthetic PDFs, not real medical records, identity details, or account numbers.</span></div><div className="mt-6 grid gap-3 md:grid-cols-3">{SLOTS.map((slot) => <DocumentUploadCard key={slot.key} slot={slot} fileName={names[slot.key]} fileSize={fileSizes[slot.key]} error={documentErrors[slot.key]} loading={loadingDocument === slot.key} busy={busy || loadingDocument !== null} previewing={preview === slot.key} onPreview={() => setPreview(preview === slot.key ? null : slot.key)} onFileSelected={(file) => void loadFile(slot.key, file)} onRemove={() => removeFile(slot.key)} />)}</div>{preview && docs[preview] ? <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="flex items-center justify-between bg-[#F7F8FA] px-4 py-3"><p className="text-sm font-bold text-[#14243A]">Extracted document text</p><button type="button" onClick={() => setPreview(null)} className="inline-flex items-center gap-1 text-xs font-bold text-[#667085] hover:text-[#14243A]"><XIcon size={14} />Close</button></div><div className="max-h-64 overflow-auto p-4">{docs[preview]!.map((page) => <div key={page.page} className="mb-4 last:mb-0"><p className="mb-1 text-xs font-bold text-[#0F766E]">Page {page.page}</p><pre className="whitespace-pre-wrap font-sans text-xs leading-5 text-[#667085]">{page.text}</pre></div>)}</div></div> : null}<div className={`mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs ${ready ? "border-[#b7dfd8]" : "border-slate-100"}`}><span className="font-semibold text-[#14243A]"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${ready ? "bg-[#0F766E]" : "bg-slate-300"}`} />{loadedCount}/3 documents ready</span>{ready ? <a href="#assistant" className="inline-flex items-center gap-1 rounded-lg bg-[#14243A] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#223b5c]">Documents ready — analyze claim <ArrowUpRightIcon size={14} /></a> : <span className="text-[#667085]">Add all three documents to begin analysis.</span>}</div></section>
        <AnalysisPanel docs={docs} ready={ready} />
      </div>
      <ClaimDashboard docs={docs} ready={ready} onToast={showToast} />

      <section id="assistant" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="assistant-heading"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#14243A] text-white"><MicIcon size={20} /></div><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0F766E]">Your AI voice assistant</p><h2 id="assistant-heading" className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#14243A]">Ask KyaKata about your deduction</h2></div></div><div className="flex items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#667085]"><span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${speakAnswers ? "bg-[#0F766E]" : "bg-slate-300"}`}><input type="checkbox" className="sr-only" checked={speakAnswers} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSpeakAnswers(event.target.checked); if (!event.target.checked) stopSpeaking(); }} /><span className={`h-3.5 w-3.5 rounded-full bg-white transition ${speakAnswers ? "translate-x-4" : "translate-x-1"}`} /></span>Voice replies</label><button type="button" onClick={clearConversation} className="text-xs font-bold text-[#667085] transition hover:text-[#14243A]">Clear chat</button></div></div>
        <div className="grid lg:grid-cols-[.8fr_1.2fr]"><aside className="border-b border-slate-100 bg-[#F7F8FA] p-5 lg:border-b-0 lg:border-r sm:p-6"><div className="rounded-2xl border border-[#d6ece8] bg-[#E5F4F1] p-4"><button type="button" onClick={() => listenToAnswer(WELCOME_MESSAGE)} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#0F766E] transition hover:bg-[#d6eee9] focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2" aria-label="Listen to KyaKata's introduction" title="Listen to introduction"><VolumeIcon size={18} /></button><h3 className="mt-4 font-bold text-[#14243A]">Namaste! I&apos;m KyaKata.</h3><p className="mt-2 text-sm leading-6 text-[#526d6a]">I can help you understand your insurance deductions, find relevant policy clauses and identify what you should ask your insurer.</p></div><div className="mt-5"><SuggestedQuestionChips questions={suggestedQuestions} ready={ready} disabled={busy} onSelect={(question) => void sendMessage(question)} /></div><div className="mt-5 flex gap-2 rounded-xl text-xs leading-5 text-[#667085]"><InfoIcon size={16} className="mt-0.5 shrink-0 text-[#5063a8]" />KyaKata explains the uploaded evidence. It does not decide or approve claims.</div></aside>
          <div className="flex min-h-[520px] flex-col"><div className="min-h-[310px] flex-1 space-y-5 overflow-y-auto bg-[#F7F8FA]/70 px-5 py-6 sm:px-6">{messages.length === 0 ? <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-[#EEF2FF] text-[#5063a8]"><SparklesIcon size={28} /></div><p className="mt-5 whitespace-pre-line text-lg font-bold leading-7 text-[#14243A]">{"Namaste! I'm KyaKata.\n\nI can help you understand your insurance deductions, find relevant policy clauses and identify what you should ask your insurer."}</p><p className="mt-3 text-sm leading-6 text-[#667085]">{ready ? "Choose a suggested question, type your own, or speak naturally." : "Add all three documents above to unlock your guided claim conversation."}</p><button type="button" onClick={() => setDraft(DEFAULT_QUESTION)} disabled={!ready} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#b9dfd9] bg-white px-4 py-2.5 text-xs font-bold text-[#0F766E] transition hover:bg-[#E5F4F1] disabled:opacity-40"><SparklesIcon size={15} />Try a sample question</button></div> : messages.map((message) => <ChatMessage key={message.id} role={message.role} text={cleanTimbreClosingTags(message.text)} streaming={message.streaming} isSpeaking={message.role === "assistant" && voiceStatus.toLowerCase().includes("speaking")} onListen={() => listenToAnswer(cleanTimbreClosingTags(message.text))} onStopAudio={stopSpeaking} onReplay={() => listenToAnswer(cleanTimbreClosingTags(message.text))} onCopy={() => void copyExplanation(cleanTimbreClosingTags(message.text))} />)}<div ref={messagesEndRef} /></div>
            <div className="border-t border-slate-100 bg-white p-5 sm:p-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span aria-live="polite" className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${recording ? "bg-rose-50 text-rose-700" : "bg-[#E5F4F1] text-[#0F766E]"}`}><span className={`h-1.5 w-1.5 rounded-full ${recording || busy ? "animate-pulse bg-rose-500" : "bg-[#0F766E]"}`} />{voiceStatus || (recording ? "Listening — tap stop when you're done" : busy ? "Analyzing your documents…" : "Ready for your question")}</span><span className="text-xs text-[#667085]">{answerLanguage === "en" ? "English answers" : answerLanguage === "hi" ? "Hindi answers" : "Hinglish answers"}</span></div><div className="mb-3 flex items-center gap-3"><AIAvatar state={avatarState} /><AudioWaveform mode={waveformMode} microphoneStream={microphoneStream} audioElement={playingAudio} className="min-w-0 flex-1" /></div><form onSubmit={submitText}>{voiceStatus.startsWith("Transcription ready") ? <label className="mb-2 block rounded-xl border border-[#b9dfd9] bg-[#f5fcfa] px-3 py-2 text-xs font-bold text-[#0F766E]">Recognized speech — review and correct any words or amounts before you send.</label> : null}<textarea value={draft} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} rows={2} disabled={!ready || busy} placeholder={ready ? "Ask a question about your claim… (Enter to send)" : "Upload all three documents to begin…"} className="w-full resize-none rounded-2xl border border-slate-200 bg-[#F7F8FA] px-4 py-3 text-sm leading-6 text-[#14243A] outline-none transition placeholder:text-slate-400 focus:border-[#0F766E] focus:bg-white focus:ring-4 focus:ring-[#E5F4F1] disabled:cursor-not-allowed disabled:opacity-60" /><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => void toggleMic()} disabled={!ready || busy} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${recording ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-slate-200 bg-white text-[#14243A] hover:border-[#0F766E] hover:bg-[#E5F4F1]"}`}>{recording ? <PauseIcon size={17} /> : <MicIcon size={17} />}{recording ? "Stop recording" : "Talk to KyaKata"}</button><button type="submit" disabled={!ready || busy || !draft.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#095f58] disabled:cursor-not-allowed disabled:opacity-40">{busy ? <><SparklesIcon size={17} className="animate-pulse" />Analyzing</> : <><ArrowUpRightIcon size={17} />Send question</>}</button>{busy ? <button type="button" onClick={() => requestAbortRef.current?.abort()} className="rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold text-[#667085] hover:bg-[#F7F8FA]">Stop</button> : null}{voiceStatus.toLowerCase().includes("speaking") ? <button type="button" onClick={stopSpeaking} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold text-[#667085] hover:bg-[#F7F8FA]"><VolumeIcon size={15} />Stop voice</button> : null}</div></form>{copyStatus ? <p className="mt-3 text-xs font-semibold text-[#0F766E]">{copyStatus}</p> : null}{status ? <p aria-live="polite" className="mt-3 text-xs text-[#667085]">{status}</p> : null}{error ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p> : null}</div></div></div>
      </section>

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-xs leading-5 text-[#667085]"><p>KyaKata is a document-explanation demo, not an insurer, broker, or legal adviser.</p><p className="flex items-center gap-1.5"><ShieldCheckIcon size={14} className="text-[#0F766E]" />Designed for clearer, evidence-led conversations.</p></footer>
      <ToastNotification message={toast} onDismiss={() => setToast("")} />
    </div>
  </main>;
}

function cleanTimbreClosingTags(text: string): string {
  return text.replace(
      /<\/\s*(?:coughs|excited|exhales|giggle|laugh|pauses|shouting|sigh|slow|sniffles|whispers|yawns|clears\s+throat)\s*>/gi,
      ""
  );
}
