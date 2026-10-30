// Optional smoke test for Gnani REST APIs.
// Run: npm run test:gnani
// To test STT as well, place a short 16 kHz mono WAV at ./sample.wav.
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const key = process.env.GNANI_API_KEY;
const ttsUrl = process.env.GNANI_TTS_URL || "https://api.vachana.ai/api/v1/tts/inference";
const sttUrl = process.env.GNANI_STT_URL || "https://api.vachana.ai/stt/v3";
const header = process.env.GNANI_AUTH_HEADER || "X-API-Key-ID";
const prefix = process.env.GNANI_AUTH_PREFIX ?? "";

if (!key) {
  console.error("Set GNANI_API_KEY in .env.local first.");
  process.exit(1);
}

const auth = { [header]: `${prefix}${key}` };

console.log("Testing Timbre TTS…");
const tts = await fetch(ttsUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...auth },
  body: JSON.stringify({
    text: "Namaste, yeh KyaKata voice test hai.",
    model: process.env.GNANI_TTS_MODEL || "timbre-v3.0",
    voice: process.env.GNANI_TTS_VOICE || "Shivani",
    language: process.env.GNANI_TTS_LANG || "hi-en",
    speed: 1.0,
    audio_config: { encoding: "linear_pcm", container: "wav", num_channels: 1, sample_rate: 48000, sample_width: 2 },
  }),
});
console.log("TTS status:", tts.status, "content-type:", tts.headers.get("content-type"));
if (!tts.ok) {
  console.error((await tts.text()).slice(0, 700));
  process.exitCode = 1;
} else {
  const bytes = Buffer.from(await tts.arrayBuffer());
  writeFileSync("tts-test.wav", bytes);
  console.log(`Saved tts-test.wav (${bytes.length} bytes).`);
}

if (existsSync("sample.wav")) {
  console.log("Testing Prisma STT…");
  const form = new FormData();
  form.append(process.env.GNANI_STT_FILE_FIELD || "audio_file", new Blob([readFileSync("sample.wav")], { type: "audio/wav" }), "sample.wav");
  form.append("model", process.env.GNANI_STT_MODEL || "prisma-v3.0");
  const languageCode = process.env.GNANI_STT_LANG || "hi-IN";
  form.append("language_code", languageCode);
  if (languageCode === "indic-auto") form.append("language_candidates", "hi-IN,en-IN");
  form.append("format", process.env.GNANI_STT_FORMAT || "codemix");
  form.append("itn_native_numerals", "true");
  const stt = await fetch(sttUrl, { method: "POST", headers: auth, body: form });
  console.log("STT status:", stt.status);
  console.log(await stt.text());
  if (!stt.ok) process.exitCode = 1;
} else {
  console.log("Skipping STT test: add sample.wav to test transcription separately.");
}
