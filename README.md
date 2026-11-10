# KyaKata — voice-first insurance document assistant

**Ask in Hinglish. Hear the answer. See the evidence.**

KyaKata helps an Indian family understand *why* an insurer deducted money from a hospital claim. It reads three documents — the hospital bill, the insurer's settlement letter and the policy wording — and answers spoken or typed questions in Hindi/Hinglish, citing the document and page each answer came from.

> Demo only. Use the bundled fictional documents, never real medical or identity data.

![Next.js](https://img.shields.io/badge/Next.js-14.2-black) ![React](https://img.shields.io/badge/React-18.3-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)

**Team:** Alok Gupta ([@Alok-0601](https://github.com/Alok-0601)) · HariharPal

---

## The problem

A claim settlement letter says "Rs. 28,000 deducted" and stops there. The reason sits in a policy clause on page 7 of a PDF written in legalese, and the person reading it is often a worried relative at a hospital counter who would rather ask a question out loud in their own language. Insurers rarely explain; families rarely have the time or vocabulary to dig.

## The idea

Put the three documents and a voice interface together, and make the answer **checkable**:

- **Voice in, voice out** — push-to-talk speech recognition (Gnani Prisma) and spoken replies (Gnani Timbre), tuned for Hindi/Hinglish code-mixed speech.
- **Grounded answers** — Gemini receives the full page-tagged text of all three documents and must cite document + page, and admit uncertainty rather than guess.
- **Local evidence check** — before Gemini answers, the app parses deductions from the settlement letter, finds the matching policy clause with a Hinglish-aware retriever, and tests whether the amounts add up (`lib/retrieve.ts`, `lib/verify.ts`). The dashboard then shows each deduction as *Amount matched*, *Needs review* or *More evidence needed*.
- **Privacy by construction** — PDFs are parsed in the browser with pdf.js. The original files are never uploaded; only extracted text is sent when a question is asked.

## Features

| Area | What it does |
|---|---|
| Documents | Upload bill / letter / policy, or click **Try fictional samples** |
| Chat | Streamed Gemini answers over server-sent events, short conversation memory |
| Voice | Tap to talk, 16 kHz mono WAV conversion in the browser, transcript inserted into chat |
| Speech out | Sentence-by-sentence TTS queue so audio starts before the full answer is written |
| Claim dashboard | Hospital bill, claimed, approved and total deducted amounts pulled from the source text |
| Evidence viewer | The exact policy clause behind each deduction, with page number |
| Insurer questions | Suggested follow-ups to ask the insurer when evidence is thin |
| UI | Waveform while recording, AI avatar, progress steps, suggested-question chips, toasts |

## Architecture

```
 [browser]  pdf.js extracts page-tagged text   (PDFs never leave the device)
     |
     |  typed question            or      voice turn
     |                                      |
     |                       16 kHz mono WAV --> /api/stt --> Gnani Prisma
     |                                      |
     v                                      v
   /api/chat  <------------ transcript + extracted text + history
     |   retrieval hint (lib/retrieve.ts) + system rules
     v
   Gemini  --SSE stream-->  chat transcript
                               |
                     complete sentences
                               v
                          /api/tts --> Gnani Timbre --> queued audio playback
```

---

## Build log — day by day

Built over two days by two people. This log is reconstructed from the git history (`git log`), so every entry maps to a real commit.

### Day 1 — Fri 30 Oct 2026 · from empty repo to a working pipeline

| Time (IST) | Who | What happened |
|---|---|---|
| 17:50 | Alok | Repo created with an initial commit. |
| 20:25 | HariharPal | Added `.gitignore` (keeps `.env.local`, `.next`, `node_modules` and the generated pdf.js worker out of git). |
| 20:28 | HariharPal | Merged the remote initial commit with the local project. |
| 20:29 | HariharPal | **Project skeleton, 32 files.** Next.js 14 + Tailwind + TypeScript; API routes for explain, STT and TTS; browser PDF extraction (`lib/pdf.ts`); Hinglish→English clause retriever (`lib/retrieve.ts`); deduction verifier (`lib/verify.ts`); WAV encoder (`lib/wav.ts`); a script that generates three fictional sample PDFs; a Gnani smoke-test script. |
| 22:20 | Alok | **Reworked the Gnani wrapper** (`lib/gnani.ts`, +107/−20): endpoint, auth header and field names made configurable instead of hard-coded, because they differ per Gnani product. |

**End of day 1:** documents in, text extracted, a first single-shot explain flow and both speech APIs wired up. Not yet conversational.

### Day 2 — Sat 31 Oct 2026 · conversation, then polish

| Time (IST) | Who | What happened |
|---|---|---|
| 01:34 | HariharPal | **Turned it into a real conversation.** Replaced the one-shot `/api/explain` + `lib/explain.ts` with a streaming `/api/chat` route (+252 lines) that sends page text, retrieval hints and history to Gemini. `app/page.tsx` rewritten (750 lines) for streamed chat and sequential speech. `lib/gnani.ts` simplified (−200/+~100) and the smoke test extended. README expanded. Unused code removed. |
| 05:17 | Alok | **UI overhaul.** Split the single page into 11 components under `components/kyakata/`: claim dashboard, policy evidence viewer, audio waveform, AI avatar, progress steps, suggested-question chips, document upload card, toast, chat message, analysis panel, brand. New design tokens in `globals.css`. `lib/verify.ts` extended with claim-amount extraction. Trimmed the Gnani smoke-test script. +996 / −239 lines. |

**End of day 2:** push-to-talk voice chat with streamed answers, spoken replies and a dashboard that shows the evidence behind each deduction.

### Totals so far

| | |
|---|---|
| Commits | 7 (4 substantive) |
| Active span | ~11.5 hours of commits across 2 days |
| Contributors | 2 |
| Net change across both days | ~6,000 lines added, ~750 removed (incl. lockfile) |

---

## What changed our mind

Decisions that forced a rewrite, in the order they happened. These are the design pivots visible in the history.

**One-shot explain → streaming chat.** The first version asked Gemini for a single explanation per upload. That cannot answer follow-ups and feels slow when spoken. It was replaced the next day by `/api/chat`, which streams over SSE so the first sentence can be spoken while the rest is still being written.

**Gnani settings → environment variables.** Prisma and Timbre use different endpoints, auth headers and multipart field names, so these are configurable (see the table below) rather than guessed. The wrapper in `lib/gnani.ts` was reworked on the evening of day 1 and again in the early hours of day 2.

**Let the model do everything → verify locally first.** A language model can sound confident and be wrong about money. `lib/verify.ts` parses deduction lines and checks the arithmetic against policy limits (room-rent cap, proportionate deduction scenarios) *outside* the model, and the result is passed to Gemini as an evidence hint and shown in the UI as a status.

**Newer Gemini models reject sampling parameters.** The Gemini 3.x family no longer accepts legacy settings such as `temperature`, so `/api/chat` leaves them out (noted in a code comment in `app/api/chat/route.ts`).

**Docs drifted from code.** The README once listed a different default Gemini model than the route actually used. The table below now matches the code (`gemini-3.6-flash`).

---

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
| `GEMINI_MODEL` | Gemini model | `gemini-3.6-flash` |
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

## Roadmap

- OCR for scanned PDFs (currently only selectable-text PDFs work)
- Full-duplex voice instead of push-to-talk
- More languages beyond Hindi/Hinglish
- Streaming TTS directly from the provider instead of sentence queueing
- A test suite for the retriever and verifier

## Credits

Built by Alok Gupta and Harihar Pal. Speech by Gnani (Prisma STT, Timbre TTS). Language model: Google Gemini. PDF parsing: pdf.js.
