import type { Chunk, ClauseEvidence, DocKey, PageText } from "./types";

// Hindi / Hinglish -> English search terms found in policy wording.
const SYNONYMS: Record<string, string[]> = {
  kamre: ["room"],
  kamra: ["room"],
  कमरे: ["room"],
  कमरा: ["room"],
  kiraya: ["rent"],
  kiraye: ["rent"],
  किराया: ["rent"],
  किराये: ["rent"],
  katauti: ["deduction"],
  kata: ["deduction"],
  kaata: ["deduction"],
  कटौती: ["deduction"],
  काटे: ["deduction"],
  kyu: ["why"],
  kyun: ["why"],
  क्यों: ["why"],
  bima: ["insurance"],
  बीमा: ["insurance"],
  dawai: ["medicines"],
  dawa: ["medicines"],
  दवाई: ["medicines"],
  aspatal: ["hospital"],
  अस्पताल: ["hospital"],
  proportionate: ["proportion", "proportionate", "same"],
  anupat: ["proportion"],
  अनुपात: ["proportion"],
  rakam: ["amount"],
  राशि: ["amount"],
  paisa: ["amount"],
  paise: ["amount"],
  rupaye: ["amount"],
};

const STOP = new Set([
  "the", "a", "an", "of", "to", "is", "are", "was", "for", "in", "on", "and", "or", "as", "per", "by", "at", "it",
  "ka", "ki", "ke", "ko", "se", "me", "mein", "hai", "hain", "kya", "ye", "yeh", "ho", "gaya", "gayi", "kiya",
  "mera", "meri", "mere", "hua", "aur", "ya", "tha", "thi", "this", "that", "with", "be", "we", "if",
  "का", "की", "के", "को", "से", "में", "है", "हैं", "क्या", "यह", "और", "या",
]);

export function tokenize(s: string): string[] {
  const raw = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
  const out: string[] = [];
  for (const t of raw) {
    out.push(t);
    if (SYNONYMS[t]) out.push(...SYNONYMS[t]);
    // crude plural stripping so "expenses" ~ "expense"
    if (t.length > 4 && t.endsWith("s")) out.push(t.slice(0, -1));
  }
  return out;
}

/** Split page text into clause-sized chunks (a numbered line starts a new chunk). */
export function chunkPages(doc: DocKey, pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const p of pages) {
    const lines = p.text.split("\n");
    let cur: string[] = [];
    let n = 0;
    const flush = () => {
      const text = cur.join("\n").trim();
      if (text) chunks.push({ doc, page: p.page, id: `${doc}-${p.page}-${n++}`, text });
      cur = [];
    };
    for (const line of lines) {
      if (/^\d+(\.\d+)*\.?\s/.test(line) && cur.length) flush();
      cur.push(line);
    }
    flush();
  }
  return chunks;
}

interface Scored {
  chunk: Chunk;
  score: number;
}

/** Small BM25 over chunks. */
export function search(query: string, chunks: Chunk[], k = 3): Scored[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(c.text));
  const N = docs.length;
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  const k1 = 1.4;
  const b = 0.75;
  const scored = chunks.map((chunk, i) => {
    const d = docs[i];
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.length) / avgLen));
    }
    return { chunk, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/** Best clause for a query, returned as a verbatim quote from the source. */
export function findClause(query: string, doc: DocKey, pages: PageText[] | undefined): ClauseEvidence | null {
  if (!pages?.length) return null;
  const hit = search(query, chunkPages(doc, pages), 1)[0];
  if (!hit || hit.score < 0.5) return null;
  return { doc, page: hit.chunk.page, quote: hit.chunk.text, score: hit.score };
}

/** Grounding check: every shown quote must exist word for word in the source. */
export function quoteExists(quote: string, pages: PageText[] | undefined): boolean {
  if (!pages) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const q = norm(quote);
  return pages.some((p) => norm(p.text).includes(q));
}
