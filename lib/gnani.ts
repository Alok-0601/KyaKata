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
  // Tries the common shapes; extend if the docs use another one.
  const j = json as Record<string, any>;
  const candidates = [j?.transcript, j?.text, j?.data?.transcript, j?.data?.text, j?.result?.text, j?.results?.[0]?.transcript];
  const hit = candidates.find((v) => typeof v === "string" && v.trim());
  if (!hit) throw new GnaniError("STT response had no transcript field; adapt pickText() in lib/gnani.ts", 502);
  return String(hit).trim();
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
export async function synthesize(text: string, lang?: string): Promise<TtsAudio> {
  const c = cfg();
  if (!c.ttsUrl) throw new GnaniError("GNANI_TTS_URL is not set", 500);

  // ADAPT (Timbre request): match the docs for body fields.
  const body = {
    model: c.ttsModel,
    text,
    language: lang || c.ttsLang,
    ...(c.ttsVoice ? { voice: c.ttsVoice } : {}),
  };

  const res = await fetch(c.ttsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GnaniError(`Timbre TTS failed (${res.status}): ${(await res.text()).slice(0, 300)}`, 502);

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    // ADAPT (Timbre response): some APIs return base64 audio inside JSON.
    const j = (await res.json()) as Record<string, any>;
    const b64: unknown = j?.audio ?? j?.audioContent ?? j?.data?.audio;
    if (typeof b64 !== "string") throw new GnaniError("TTS JSON had no audio field; adapt synthesize() in lib/gnani.ts", 502);
    const buf = Buffer.from(b64, "base64");
    return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: "audio/wav" };
  }
  return { bytes: await res.arrayBuffer(), contentType: ct || "audio/wav" };
}
