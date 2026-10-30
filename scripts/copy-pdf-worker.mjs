import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = resolve(root, "public/pdf.worker.min.mjs");

if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("Copied pdf.js worker to public/");
} else {
  console.warn("pdfjs-dist worker not found; run npm install first.");
}
