# KyaKata — voice-first insurance document assistant

KyaKata helps a user understand an insurance deduction by comparing three fictional documents: a hospital bill, an insurance settlement letter and policy wording. It is a demo only; use synthetic documents, never real medical or identity data.

## How the conversation works

1. The browser extracts page-tagged text from each PDF with pdf.js. The original PDF files are not uploaded to the application server.
2. The user types a question or records a voice turn.
3. For voice input, the browser converts the recording to 16 kHz mono WAV and `/api/stt` sends it to Gnani Prisma. The transcript is inserted into the chat and sent to Gemini.
4. `/api/chat` sends the extracted page text, a small amount of conversation history and the latest question to Gemini. Gemini streams response text back to the browser using server-sent events.
5. As complete sentences arrive, the browser queues them sequentially through `/api/tts` to Gnani Timbre. The transcript remains visible in the chat while the audio plays.

This is push-to-talk, turn-based voice chat: speak, stop recording, wait for transcription, then hear the response. It is not an always-open full-duplex phone-call connection.

## Requirements

- Node.js 20 or newer
- A Google Gemini API key
- A Gnani API key with Prisma STT and Timbre TTS access

## Run locally (Windows PowerShell)

```powershell
# Open this folder in VS Code. The current directory must contain package.json.
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local` and add your real `GEMINI_API_KEY` and `GNANI_API_KEY`. Keep the Gnani endpoint and model values unless your Gnani account documentation says otherwise.

```powershell
npm run dev
```

Open http://localhost:3000.

## Verify the flow

1. Click **Try fictional samples**.
2. Ask: `Mere hospital bill mein ₹28,000 deduct kyun hue?`
3. Watch the assistant transcript stream into the chat.
4. With **Speak answers** enabled, completed sentences are sent to Timbre one at a time and played in order.
5. Click **Tap to talk**, speak, then click **Stop recording**. Prisma's transcript is shown as your chat message and automatically sent to Gemini.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API key | required |
| `GEMINI_MODEL` | Gemini model | `gemini-3.8-flash` |
| `GNANI_API_KEY` | Gnani API key | required |
| `GNANI_AUTH_HEADER` | Gnani key header | `X-API-Key-ID` |
| `GNANI_STT_URL` | Prisma REST endpoint | `https://api.vachana.ai/stt/v3` |
| `GNANI_STT_FILE_FIELD` | Multipart audio field | `audio_file` |
| `GNANI_STT_LANG` | Speech language hint | `hi-IN` |
| `GNANI_STT_FORMAT` | Transcript mode | `codemix` |
| `GNANI_TTS_URL` | Timbre REST endpoint | `https://api.vachana.ai/api/v1/tts/inference` |
| `GNANI_TTS_MODEL` | Timbre model | `timbre-v3.0` |
| `GNANI_TTS_VOICE` | Timbre v3 voice | `Shivani` |
| `GNANI_TTS_LANG` | TTS language | `hi-en` |

## Main implementation files

- `app/page.tsx` — voice-first chat UI, PDF upload, microphone capture, streamed transcript and sequential speech playback.
- `app/api/chat/route.ts` — server-side Gemini streaming endpoint; the Gemini key never reaches the browser.
- `app/api/stt/route.ts` — Prisma transcription endpoint.
- `app/api/tts/route.ts` — Timbre speech endpoint.
- `lib/gnani.ts` — server-only Gnani Prisma/Timbre wrappers.
- `lib/pdf.ts` — browser-side, page-tagged PDF text extraction.
- `lib/retrieve.ts` and `lib/verify.ts` — local clause retrieval and basic evidence hints supplied to Gemini.

## Important limitations

- Only selectable-text PDFs are supported by the current browser extractor. Scanned PDFs need OCR, which is not included.
- The complete extracted text is sent to Gemini when a question is asked. Do not use real personal or medical documents in the public demo.
- Gemini is instructed to cite document/page evidence and admit uncertainty, but generated explanations still require validation against the source documents. The app is not an automated claim adjudicator.
- TTS is sentence-queued after Gemini produces sentence boundaries. It is not a continuous audio stream from the TTS provider.
- Keep `.env.local` private. Never commit API keys or include them in a public sample ZIP.

## Build checks

```powershell
npm run typecheck
npm run build
```
