import { NextResponse } from "next/server";
import { GnaniError, transcribe } from "@/lib/gnani";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel Hobby body limit is ~4.5 MB

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Audio too large; keep it under ~30 seconds" }, { status: 413 });

    const lang = typeof form.get("lang") === "string" ? (form.get("lang") as string) : undefined;
    const text = await transcribe(audio, "audio.wav", lang);
    return NextResponse.json({ text });
  } catch (e) {
    const status = e instanceof GnaniError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "STT failed" }, { status });
  }
}
