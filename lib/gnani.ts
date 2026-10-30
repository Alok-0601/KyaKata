// Server-only wrappers for Gnani Prisma (STT) and Timbre (TTS).
//
// IMPORTANT: endpoint URLs, auth header and field names are read from env
// (see .env.local.example) because they must be copied from docs.gnani.ai, not
// guessed. If the docs use different request/response shapes, adapt ONLY the
// two marked ADAPT blocks below.

function cfg() {
  return {
    key: process.env.GNANI_API_KEY ?? "",
    authHeader: process.env.GNANI_AUTH_HEADER || "Authorization",
    authPrefix: process.env.GNANI_AUTH_PREFIX ?? "Bearer ",
    sttUrl: process.env.GNANI_STT_URL ?? "",
    sttLang: process.env.GNANI_STT_LANG || "hi-IN",
    sttField: process.env.GNANI_STT_FILE_FIELD || "file",
    ttsUrl: process.env.GNANI_TTS_URL ?? "",
    ttsLang: process.env.GNANI_TTS_LANG || "hi-IN",
    ttsVoice: process.env.GNANI_TTS_VOICE || "",
    ttsModel: process.env.GNANI_TTS_MODEL || "timbre-v2.5",
  };
}

export class GnaniError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const c = cfg();
  if (!c.key) throw new GnaniError("GNANI_API_KEY is not set", 500);
  return { [c.authHeader]: `${c.authPrefix}${c.key}` };
}


function pickText(json: unknown): string {
  const j = json as Record<string, any>;

  // Check the documented and common response formats.
  const candidates = [
    j?.transcript,
    j?.text,
    j?.data?.transcript,
    j?.data?.text,
    j?.result?.transcript,
    j?.result?.text,
    j?.results?.[0]?.transcript,
    j?.output?.transcript,
    j?.output?.literal,
  ];

  const hit = candidates.find(
    (value) => typeof value === "string"
  );

  if (typeof hit === "string") {
    if (!hit.trim()) {
      throw new GnaniError(
        "Prisma received the audio but detected no speech. Please record again.",
        502
      );
    }

    return hit.trim();
  }

  // Do not silently hide an unexpected API response.
  if (j?.success === false) {
    const message =
      j?.error?.message ??
      j?.message ??
      j?.detail?.[0]?.msg ??
      "Unknown Prisma API error";

    throw new GnaniError(
      `Prisma API reported: ${message}`,
      502
    );
  }

  const fields = Object.keys(j ?? {}).join(", ");

  throw new GnaniError(
    `Unexpected Prisma response. Received fields: ${fields || "none"}. Check the VS Code terminal.`,
    502
  );
}


/** Prisma: audio -> text. */
export async function transcribe(audio: Blob, filename = "audio.wav", lang?: string): Promise<string> {
  const c = cfg();
  if (!c.sttUrl) throw new GnaniError("GNANI_STT_URL is not set", 500);

  // ADAPT (Prisma request): match the docs for field names / params.
  const fd = new FormData();
  fd.append(c.sttField, audio, filename);
  fd.append("language_code", lang || c.sttLang);
  fd.append("preferred_language", lang || c.sttLang);
  fd.append("format", "transcribe");
  fd.append("itn_native_numerals", "true");

  const res = await fetch(c.sttUrl, { method: "POST", headers: authHeaders(), body: fd });
  if (!res.ok) throw new GnaniError(`Prisma STT failed (${res.status}): ${(await res.text()).slice(0, 300)}`, 502);
  return pickText(await res.json());
}

export interface TtsAudio {
  bytes: ArrayBuffer;
  contentType: string;
}

/** Timbre: text -> audio. */

export async function synthesize(
  text: string,
  lang?: string
): Promise<TtsAudio> {
  const c = cfg();

  if (!c.ttsUrl) {
    throw new GnaniError("GNANI_TTS_URL is not set", 500);
  }

  const body = {
    model: c.ttsModel,
    text,
    language: lang || c.ttsLang,
    ...(c.ttsVoice ? { voice: c.ttsVoice } : {}),
    speed: 1.0,
    audio_config: {
      encoding: "linear_pcm",
      container: "wav",
      num_channels: 1,
      sample_rate: 48000,
      sample_width: 2,
    },
  };

  const res = await fetch(c.ttsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();

    throw new GnaniError(
      `Timbre TTS failed (${res.status}): ${errorText.slice(0, 400)}`,
      502
    );
  }

  const contentType = res.headers.get("content-type") || "";

  // Gnani REST should return playable audio bytes.
  if (!contentType.toLowerCase().startsWith("audio/")) {
    const responseText = await res.text();

    throw new GnaniError(
      `Timbre returned non-audio content (${contentType}): ${responseText.slice(0, 300)}`,
      502
    );
  }

  const bytes = await res.arrayBuffer();

  if (bytes.byteLength === 0) {
    throw new GnaniError(
      "Timbre returned an empty audio file.",
      502
    );
  }

  return {
    bytes,
    contentType,
  };
}

