export type DocKey = "bill" | "letter" | "policy";

export interface PageText {
  page: number; // 1-based
  text: string; // lines separated by \n
}

export type DocSet = Partial<Record<DocKey, PageText[]>>;

export interface Chunk {
  doc: DocKey;
  page: number;
  id: string;
  text: string;
}

export type Status = "verified" | "partly" | "cannot_verify";

export interface Deduction {
  label: string;
  amount: number;
  page: number;
  line: string;
}

export interface ClauseEvidence {
  doc: DocKey;
  page: number;
  quote: string; // exact substring of the source page text
  score: number;
}

export interface Scenario {
  name: string;
  amount: number;
  matches: boolean;
}
