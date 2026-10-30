import { findClause, quoteExists } from "./retrieve";
import { parseDeductions, verify } from "./verify";
import type { Deduction, DocSet, ExplainResult } from "./types";

const inr = (n: number) => "Rs. " + n.toLocaleString("en-IN");

/** Pick the deduction the question is about (by keyword overlap), else the first. */
function pickDeduction(question: string, deductions: Deduction[]): Deduction | null {
  if (!deductions.length) return null;
  const q = question.toLowerCase();
  const room = /room|kamre|kamra|kiraya|kiraye|rent|कमरे|कमरा|किराया|किराये/.test(q);
  if (room) {
    const hit = deductions.find((d) => /room|rent/i.test(d.label));
    if (hit) return hit;
  }
  return deductions[0];
}

export function explain(question: string, docs: DocSet): ExplainResult {
  const deductions = parseDeductions(docs.letter);
  const deduction = pickDeduction(question, deductions);

  let clause = null;
  if (deduction) {
    clause = findClause(`${deduction.label} ${question}`, "policy", docs.policy);
    // Never show a quote that is not literally in the source.
    if (clause && !quoteExists(clause.quote, docs.policy)) clause = null;
  }

  const v = verify(deduction, !!clause, docs);

  const nextQuestions: string[] = [];
  if (deduction) {
    nextQuestions.push(`Please share the exact calculation behind the ${inr(deduction.amount)} deduction.`);
    nextQuestions.push("Which charges did you treat as 'associated medical expenses' for the proportionate reduction?");
    nextQuestions.push("Which policy clause number did you apply, and can you give it to me in writing?");
  } else {
    nextQuestions.push("Please send the itemised settlement letter showing each deduction and its reason.");
  }

  let answerEn: string;
  let answerHinglish: string;

  if (!deduction) {
    answerEn = "I could not find a deduction in the settlement letter, so I cannot explain it yet. Please check that the right file is in the letter slot.";
    answerHinglish = "Settlement letter mein mujhe koi katauti nahi mili, isliye abhi samjha nahi sakta. Kripya check karein ki letter wale slot mein sahi file hai.";
  } else if (v.status === "cannot_verify") {
    answerEn = `The letter deducts ${inr(deduction.amount)} for "${deduction.label}", but I could not find a matching clause in the policy, so I cannot verify it.`;
    answerHinglish = `Letter mein ${deduction.amount} rupaye ki katauti "${deduction.label}" ke naam par hai, lekin policy mein iska clause nahi mila, isliye main ise verify nahi kar sakta.`;
  } else {
    const where = clause ? `page ${clause.page} of the policy` : "the policy";
    const verdict =
      v.status === "verified"
        ? "The amount matches a calculation from your documents."
        : "But I cannot verify the exact amount yet, because the letter does not show how it was calculated.";
    const verdictHi =
      v.status === "verified"
        ? "Yeh rakam aapke documents ke hisaab se match karti hai."
        : "Lekin main sahi rakam abhi verify nahi kar sakta, kyunki letter mein hisaab nahi dikhaya gaya hai.";
    answerEn = `The insurer deducted ${inr(deduction.amount)} for "${deduction.label}". The reason is supported by a clause on ${where}. ${verdict}`;
    answerHinglish = `Bima company ne ${deduction.amount} rupaye kaate hain, wajah: "${deduction.label}". Yeh wajah policy ke page ${clause?.page ?? ""} ke clause se match karti hai. ${verdictHi}`;
  }

  return {
    status: v.status,
    deduction,
    clause,
    known: v.known,
    missing: v.missing,
    scenarios: v.scenarios,
    nextQuestions,
    answerEn,
    answerHinglish,
  };
}
