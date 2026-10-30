import { NextResponse } from "next/server";
import { explain } from "@/lib/explain";
import type { DocSet } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_CHARS = 200_000;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { question?: string; docs?: DocSet };
    const question = (body.question ?? "").trim();
    if (!question) return NextResponse.json({ error: "Question is empty" }, { status: 400 });
    if (!body.docs || typeof body.docs !== "object") return NextResponse.json({ error: "No documents provided" }, { status: 400 });

    const size = JSON.stringify(body.docs).length;
    if (size > MAX_CHARS) return NextResponse.json({ error: "Documents are too long for this demo" }, { status: 413 });

    return NextResponse.json(explain(question, body.docs));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Explain failed" }, { status: 500 });
  }
}
