import { NextResponse } from "next/server";
import { GnaniError, synthesize } from "@/lib/gnani";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { text, lang } = (await req.json()) as { text?: string; lang?: string };
    if (!text || !text.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });
    if (text.length > 1500) return NextResponse.json({ error: "Text too long" }, { status: 413 });

    const audio = await synthesize(text.trim(), lang);
    return new Response(audio.bytes, {
      status: 200,
      headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    const status = e instanceof GnaniError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "TTS failed" }, { status });
  }
}
