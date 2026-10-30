// Server-only wrappers for Gnani Prisma STT and Timbre TTS.
// Never import this module from a client component.

function cfg() {
  return {
    key: process.env.GNANI_API_KEY ?? "",
    authHeader: process.env.GNANI_AUTH_HEADER || "X-API-Key-ID",
    authPrefix: process.env.GNANI_AUTH_PREFIX ?? "",
    sttUrl: process.env.GNANI_STT_URL || "https://api.vachana.ai/stt/v3",
    sttLang: process.env.GNANI_STT_LANG || "hi-IN",
    sttModel: process.env.GNANI_STT_MODEL || "prisma-v3.0",
    sttField: process.env.GNANI_STT_FILE_FIELD || "audio_file",
    sttFormat: process.env.GNANI_STT_FORMAT || "codemix",
    ttsUrl: process.env.GNANI_TTS_URL || "https://api.vachana.ai/api/v1/tts/inference",
    ttsLang: process.env.GNANI_TTS_LANG || "hi-en",
    ttsVoice: process.env.GNANI_TTS_VOICE || "Shivani",
    ttsModel: process.env.GNANI_TTS_MODEL || "timbre-v3.0",
  };
}

export class GnaniError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "GnaniError";
  }
}

function authHeaders(): Record<string, string> {
  const c = cfg();
  if (!c.key) throw new GnaniError("GNANI_API_KEY is not set in .env.local", 500);
  return { [c.authHeader]: `${c.authPrefix}${c.key}` };
}

function pickTranscript(payload: unknown): string {
  const json = payload as Record<string, any>;
  const candidates = [
    json?.transcript,
    json?.text,
    json?.data?.transcript,
    json?.data?.text,
    json?.result?.transcript,
    json?.result?.text,
    json?.results?.[0]?.transcript,
    json?.output?.transcript,
    json?.output?.literal,
  ];
  const transcript = candidates.find((value) => typeof value === "string");
  if (typeof transcript === "string" && transcript.trim()) return transcript.trim();

  if (json?.success === false) {
    const message = json?.error?.message || json?.message || json?.detail?.message || "Unknown Prisma error";
    throw new GnaniError(`Prisma reported: ${message}`, 502);
  }
  if (typeof transcript === "string") {
    throw new GnaniError("Prisma received the audio but detected no speech. Please try again.", 502);
  }
  throw new GnaniError(`Unexpected Prisma response: ${Object.keys(json || {}).join(", ") || "empty response"}`, 502);
}

/** Prisma REST: recorded WAV audio -> transcript. */
export async function transcribe(audio: Blob, filename = "question.wav", lang?: string): Promise<string> {
  const c = cfg();
  if (!c.sttUrl) throw new GnaniError("GNANI_STT_URL is not set", 500);

  const form = new FormData();
  form.append(c.sttField, audio, filename);
  // Prisma v3.0 is opt-in. Without this field the API may use a different model.
  form.append("model", c.sttModel);
  const languageCode = lang || c.sttLang;
  form.append("language_code", languageCode);
  if (languageCode === "indic-auto") {
    form.append("language_candidates", "hi-IN,en-IN");
  }
  form.append("format", c.sttFormat);
  form.append("itn_native_numerals", "true");

  const response = await fetch(c.sttUrl, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    // Preserve provider 4xx codes so the UI reveals auth/config/request errors.
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new GnaniError(`Prisma STT provider returned ${response.status}: ${detail}`, status);
  }
  return pickTranscript(await response.json());
}

export interface TtsAudio {
  bytes: ArrayBuffer;
  contentType: string;
}

/** Timbre REST: text -> WAV audio. */
export async function synthesize(text: string, lang?: string): Promise<TtsAudio> {
  const c = cfg();
  if (!c.ttsUrl) throw new GnaniError("GNANI_TTS_URL is not set", 500);

  // Timbre v3 requires model, voice and language. Shivani is a v3.0 voice.
  const body = {
    text,
    model: c.ttsModel,
    voice: c.ttsVoice,
    language: lang || c.ttsLang,
    speed: 1.0,
    audio_config: {
      encoding: "linear_pcm",
      container: "wav",
      num_channels: 1,
      sample_rate: 48000,
      sample_width: 2,
    },
  };

  const response = await fetch(c.ttsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new GnaniError(`Timbre TTS provider returned ${response.status}: ${detail}`, status);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    const detail = (await response.text()).slice(0, 400);
    throw new GnaniError(`Timbre returned non-audio content (${contentType}): ${detail}`, 502);
  }

  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new GnaniError("Timbre returned an empty audio file.", 502);
  return { bytes, contentType };
}
