// Generates three FICTIONAL text PDFs (no real people, numbers or accounts).
// Dependency-free minimal PDF writer. Run: npm run gen:samples
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/samples");
mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function makePdf(pages) {
  const objs = [];
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  for (const lines of pages) {
    let y = 800;
    let content = "BT\n";
    for (const raw of lines) {
      const bold = raw.startsWith("# ");
      const text = bold ? raw.slice(2) : raw;
      const size = bold ? 14 : 11;
      content += `/${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 50 ${y} Tm (${esc(text)}) Tj\n`;
      y -= bold ? 26 : 18;
    }
    content += "ET";
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> >>`
    );
    pageIds.push(pageId);
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const bill = [
  [
    "# Sunrise Care Hospital (FICTIONAL) - Final Bill",
    "Bill No: SCH-DEMO-0001      Date: 12 September 2026",
    "Patient: Demo Patient (Synthetic)      Policy No: DEMO-POL-000000",
    "Admission: 06 September 2026      Discharge: 11 September 2026",
    "",
    "Charges",
    "Room Rent (Deluxe Room): 5 days x Rs. 8,000 per day = Rs. 40,000",
    "Doctor and Consultant Fees: Rs. 20,000",
    "Operation Theatre Charges: Rs. 30,000",
    "Medicines and Consumables: Rs. 12,000",
    "Diagnostics and Miscellaneous: Rs. 8,000",
    "",
    "Total Claimed Amount: Rs. 1,10,000",
    "This is a synthetic document created for a public demo.",
  ],
];

const letter = [
  [
    "# Demo Health Insurance Co. (FICTIONAL) - Claim Settlement Letter",
    "Claim No: DEMO-CLM-0001      Date: 28 September 2026",
    "Policy No: DEMO-POL-000000      Insured: Demo Patient (Synthetic)",
    "",
    "Dear Policyholder,",
    "We have processed your cashless claim of Rs. 1,10,000.",
    "The following deductions have been applied:",
    "",
    "Deduction 1: Room rent - proportionate deduction as per policy terms - Rs. 28,000",
    "",
    "Amount approved: Rs. 82,000",
    "For queries, please refer to your policy wording.",
    "This is a synthetic document created for a public demo.",
  ],
];

const policy = [
  [
    "# Demo Health Insurance Co. (FICTIONAL) - Policy Wording",
    "Policy No: DEMO-POL-000000",
    "Sum Insured: Rs. 5,00,000",
    "",
    "1. Definitions",
    "1.1 Hospitalisation means admission in a hospital for more than 24 hours.",
    "1.2 Sum Insured means the maximum amount payable in a policy year.",
    "",
    "2. Coverage",
    "2.1 We cover in-patient hospitalisation expenses incurred for treatment of illness or injury.",
    "2.2 Pre and post hospitalisation expenses are covered as per the schedule.",
  ],
  [
    "# Policy Wording - Limits and Deductions",
    "",
    "4. Limits on Room Rent",
    "4.1 Room rent is covered up to 1% of the Sum Insured per day.",
    "4.2 If the insured opts for a room with rent higher than the eligible limit, the",
    "claim for room rent and all associated medical expenses is reduced",
    "in the same proportion as the eligible room rent bears to the room rent actually charged.",
    "4.3 Associated medical expenses include doctor fees, nursing and operation theatre charges.",
    "",
    "5. General Exclusions",
    "5.1 Expenses not related to treatment, such as personal items, are not payable.",
    "5.2 Non-medical consumables are payable only as listed in the schedule of items.",
  ],
];

writeFileSync(resolve(outDir, "hospital-bill.pdf"), makePdf(bill));
writeFileSync(resolve(outDir, "settlement-letter.pdf"), makePdf(letter));
writeFileSync(resolve(outDir, "policy-wording.pdf"), makePdf(policy));
console.log("Wrote 3 sample PDFs to", outDir);
