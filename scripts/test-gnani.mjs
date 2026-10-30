// Hour 0-1 check: one Timbre (TTS) call, then one Prisma (STT) call with the result.
// Usage: node --env-file=.env.local.local scripts/test-gnani.mjs
// Adapt lib/gnani.ts to docs.gnani.ai first; this script only hits the same endpoints.
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const key = process.env.GNANI_API_KEY;
const ttsUrl = process.env.GNANI_TTS_URL;
const sttUrl = process.env.GNANI_STT_URL;
const header = process.env.GNANI_AUTH_HEADER || "Authorization";
const prefix = process.env.GNANI_AUTH_PREFIX ?? "Bearer ";

if (!key || !ttsUrl || !sttUrl) {
  console.error("Set GNANI_API_KEY, GNANI_STT_URL and GNANI_TTS_URL in .env.local.local (see .env.local.example).");
  process.exit(1);
}

const auth = { [header]: `${prefix}${key}` };

console.log("TTS ->", ttsUrl);
const tts = await fetch(ttsUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...auth },
  body: JSON.stringify({
    text: "Namaste, yeh ek test hai.",
    language: process.env.GNANI_TTS_LANG || "hi-IN",
    voice: process.env.GNANI_TTS_VOICE || undefined,
  }),
});
console.log("TTS status", tts.status, tts.headers.get("content-type"));
const ttsBuf = Buffer.from(await tts.arrayBuffer());
writeFileSync("tts-test.out", ttsBuf);
console.log("Saved tts-test.out (", ttsBuf.length, "bytes ) - inspect it, it may be audio or JSON");

if (existsSync("sample.wav")) {
  console.log("STT ->", sttUrl);
  const fd = new FormData();
  fd.append(process.env.GNANI_STT_FILE_FIELD || "file", new Blob([readFileSync("sample.wav")], { type: "audio/wav" }), "sample.wav");
  fd.append("language", process.env.GNANI_STT_LANG || "hi-IN");
  const stt = await fetch(sttUrl, { method: "POST", headers: auth, body: fd });
  console.log("STT status", stt.status);
  console.log(await stt.text());
} else {
  console.log("Put a short sample.wav (16 kHz mono) in this folder to also test STT.");
}
