"use client";

import type { PageText } from "./types";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      // Worker is copied to /public by scripts/copy-pdf-worker.mjs (postinstall).
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

interface TextItem {
  str: string;
  transform: number[];
}

/** Extract page-tagged text on the user's device. Nothing is uploaded. */
export async function extractPages(data: ArrayBuffer): Promise<PageText[]> {
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: PageText[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();

    for (const raw of content.items) {
      const item = raw as TextItem;
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3); // bucket close baselines together
      const arr = rows.get(y) ?? [];
      arr.push({ x: item.transform[4], s: item.str });
      rows.set(y, arr);
    }

    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top to bottom
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((x) => x.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);

    pages.push({ page: p, text: lines.join("\n") });
  }
  return pages;
}

export async function extractFromFile(file: File): Promise<PageText[]> {
  return extractPages(await file.arrayBuffer());
}

export async function extractFromUrl(url: string): Promise<PageText[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return extractPages(await res.arrayBuffer());
}
