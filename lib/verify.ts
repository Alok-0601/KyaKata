import type { Deduction, DocSet, PageText, Scenario, Status } from "./types";

const AMT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i;

export function parseAmount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function allLines(pages: PageText[] | undefined): { page: number; line: string }[] {
  return (pages ?? []).flatMap((p) => p.text.split("\n").map((line) => ({ page: p.page, line })));
}

/** Pull "Deduction N: reason - Rs. X" lines out of the settlement letter. */
export function parseDeductions(letter: PageText[] | undefined): Deduction[] {
  const out: Deduction[] = [];
  for (const { page, line } of allLines(letter)) {
    if (!/deduct/i.test(line)) continue;
    const m = line.match(AMT);
    if (!m) continue;
    const label = line
      .replace(AMT, "")
      .replace(/^\s*deductions?\s*\d*\s*[:\-]?\s*/i, "")
      .replace(/[\s\-–:]+$/g, "")
      .trim();
    out.push({ label: label || "Unspecified deduction", amount: parseAmount(m[1]), page, line });
  }
  return out;
}

export interface Facts {
  sumInsured?: number;
  limitPct?: number;
  roomRate?: number;
  roomDays?: number;
  billTotal?: number;
}

export function extractFacts(docs: DocSet): Facts {
  const f: Facts = {};
  for (const { line } of allLines(docs.policy)) {
    const si = line.match(/sum insured[^0-9₹]*(?:rs\.?|inr|₹)\s*([\d,]+)/i);
    if (si && f.sumInsured === undefined) f.sumInsured = parseAmount(si[1]);
    const pct = line.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(?:the\s*)?sum insured/i);
    if (pct && /room/i.test(line) && f.limitPct === undefined) f.limitPct = Number(pct[1]);
  }
  for (const { line } of allLines(docs.bill)) {
    const room = line.match(/room[^\n]*?(\d+)\s*days?\s*x\s*(?:rs\.?|inr|₹)\s*([\d,]+)/i);
    if (room && f.roomDays === undefined) {
      f.roomDays = Number(room[1]);
      f.roomRate = parseAmount(room[2]);
    }
    if (/total/i.test(line)) {
      const t = line.match(AMT);
      if (t) f.billTotal = parseAmount(t[1]);
    }
  }
  return f;
}

export interface Verification {
  status: Status;
  scenarios: Scenario[];
  known: string[];
  missing: string[];
}

const inr = (n: number) => "Rs. " + n.toLocaleString("en-IN");

/**
 * Status rules:
 *  - cannot_verify: no matching clause found
 *  - verified: a clause supports the reason AND a calculation from the documents reproduces the amount
 *  - partly: clause supports the reason but the amount cannot be reproduced
 */
export function verify(deduction: Deduction | null, hasClause: boolean, docs: DocSet): Verification {
  const known: string[] = [];
  const missing: string[] = [];
  const scenarios: Scenario[] = [];

  if (!deduction) {
    missing.push("No deduction line was found in the settlement letter.");
    return { status: "cannot_verify", scenarios, known, missing };
  }

  known.push(`The letter deducts ${inr(deduction.amount)} for: ${deduction.label}.`);

  if (!hasClause) {
    missing.push("No policy clause matching this reason was found in the policy document.");
    return { status: "cannot_verify", scenarios, known, missing };
  }
  known.push("A policy clause that covers this kind of deduction exists (shown above).");

  const f = extractFacts(docs);
  const isRoom = /room|rent|proportion/i.test(deduction.label);

  if (isRoom) {
    if (f.sumInsured === undefined) missing.push("Sum insured was not found in the policy.");
    else known.push(`Sum insured: ${inr(f.sumInsured)}.`);
    if (f.limitPct === undefined) missing.push("The room rent limit (% of sum insured) was not found.");
    else known.push(`Room rent limit: ${f.limitPct}% of sum insured per day.`);
    if (f.roomRate === undefined || f.roomDays === undefined) missing.push("Room rent per day and number of days were not found in the bill.");
    else known.push(`Bill: ${f.roomDays} days at ${inr(f.roomRate)} per day.`);
    if (f.billTotal === undefined) missing.push("The total bill amount was not found.");

    if (
      f.sumInsured !== undefined && f.limitPct !== undefined &&
      f.roomRate !== undefined && f.roomDays !== undefined && f.billTotal !== undefined
    ) {
      const limit = (f.sumInsured * f.limitPct) / 100;
      known.push(`Eligible room rent works out to ${inr(limit)} per day.`);
      const roomTotal = f.roomRate * f.roomDays;
      const excess = Math.max(0, f.roomRate - limit) * f.roomDays;
      const ratio = Math.min(1, limit / f.roomRate);
      const proportionateOthers = (f.billTotal - roomTotal) * (1 - ratio);
      const wholeBill = f.billTotal * (1 - ratio);
      const mk = (name: string, amount: number): Scenario => ({ name, amount: Math.round(amount), matches: Math.round(amount) === deduction.amount });
      scenarios.push(
        mk("Excess room rent only", excess),
        mk("Excess room rent + proportionate cut on other charges", excess + proportionateOthers),
        mk("Proportionate cut on the whole bill", wholeBill)
      );
    }
    if (!scenarios.some((s) => s.matches)) {
      missing.push("The letter gives no breakdown of how the amount was calculated, and none of the standard calculations reproduces it.");
    }
  } else {
    missing.push("This deduction type has no calculation rule in the app yet, so the amount cannot be recomputed.");
  }

  const status: Status = scenarios.some((s) => s.matches) ? "verified" : "partly";
  return { status, scenarios, known, missing };
}
