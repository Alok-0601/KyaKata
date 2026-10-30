"use client";

import { useEffect, useMemo, useState } from "react";

export type AudioWaveformMode = "idle" | "listening" | "speaking";

interface Props {
  mode: AudioWaveformMode;
  microphoneStream?: MediaStream | null;
  audioElement?: HTMLAudioElement | null;
  className?: string;
}

let sharedContext: AudioContext | null = null;
const elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedContext || sharedContext.state === "closed") {
    const BrowserAudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!BrowserAudioContext) return null;
    sharedContext = new BrowserAudioContext();
  }
  return sharedContext;
}

/**
 * Call during a user gesture before recording or TTS playback. This honours
 * autoplay policy without creating a second recorder or playback path.
 */
export async function primeAudioWaveform() {
  const context = getContext();
  if (context?.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // The waveform remains quiet until the browser permits audio analysis.
    }
  }
}

function staticLevel(index: number, total: number) {
  const centre = Math.abs(index - (total - 1) / 2) / total;
  return 0.16 + (1 - centre) * 0.14;
}

export function AudioWaveform({ mode, microphoneStream, audioElement, className = "" }: Props) {
  const barCount = 38;
  const idleLevels = useMemo(() => Array.from({ length: barCount }, (_, index) => staticLevel(index, barCount)), []);
  const [levels, setLevels] = useState(idleLevels);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (mode === "idle" || reducedMotion) {
      setLevels(idleLevels);
      return;
    }

    const context = getContext();
    if (!context) {
      setLevels(idleLevels);
      return;
    }

    let source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame = 0;
    let cancelled = false;

    try {
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;

      if (mode === "listening" && microphoneStream) {
        source = context.createMediaStreamSource(microphoneStream);
        source.connect(analyser);
      } else if (mode === "speaking" && audioElement) {
        source = elementSources.get(audioElement) ?? context.createMediaElementSource(audioElement);
        if (!elementSources.has(audioElement)) elementSources.set(audioElement, source);
        source.connect(analyser);
        analyser.connect(context.destination);
      } else {
        setLevels(idleLevels);
        return;
      }

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const render = () => {
        if (cancelled || !analyser) return;
        analyser.getByteFrequencyData(samples);
        const next = Array.from({ length: barCount }, (_, index) => {
          const start = Math.floor((index / barCount) * samples.length);
          const end = Math.max(start + 1, Math.floor(((index + 1) / barCount) * samples.length));
          let sum = 0;
          for (let sample = start; sample < end; sample += 1) sum += samples[sample];
          const signal = sum / (end - start) / 255;
          // Keep a visible floor but let the microphone/Timbre signal drive every bar.
          return Math.min(1, 0.09 + signal * 0.91);
        });
        setLevels(next);
        frame = requestAnimationFrame(render);
      };

      void context.resume().catch(() => undefined);
      render();
    } catch {
      // A source can fail only if the browser rejects the routing. Do not fake levels.
      setLevels(idleLevels);
    }

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (source && analyser) {
        try { source.disconnect(analyser); } catch { /* source already disconnected */ }
      }
      if (analyser) {
        try { analyser.disconnect(); } catch { /* analyser already disconnected */ }
      }
      setLevels(idleLevels);
    };
  }, [audioElement, idleLevels, microphoneStream, mode, reducedMotion]);

  const label = mode === "listening" ? "Listening..." : mode === "speaking" ? "KyaKata is speaking..." : "Voice assistant ready";

  return (
    <div className={`rounded-2xl border border-[#d6ece8] bg-[#f5fcfa] px-3 py-2.5 ${className}`} aria-label={label}>
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${mode === "idle" ? "bg-[#79bcb2]" : "animate-pulse bg-[#0F766E]"}`} aria-hidden="true" />
        <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[3px]" aria-hidden="true">
          {levels.map((level, index) => (
            <span
              key={index}
              className="audio-wave-bar w-1 max-w-[4px] flex-1 rounded-full bg-gradient-to-t from-[#0F766E] to-[#8edfd0] shadow-[0_0_8px_rgba(15,118,110,0.22)]"
              style={{ height: `${Math.round(5 + level * 30)}px` }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-bold text-[#0F766E]">{label}</span>
      </div>
    </div>
  );
}
