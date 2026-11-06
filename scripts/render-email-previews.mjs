#!/usr/bin/env node
/**
 * Renders HTML previews and PNG screenshots for PR documentation.
 * Usage: node scripts/render-email-previews.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PREVIEW_SAMPLES } from "../server/worker-src/email/templates.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/email-previews");

const samples = [
  ["confirmation", PREVIEW_SAMPLES.confirmation],
  ["rank-change", PREVIEW_SAMPLES.rankChange],
  ["milestone", PREVIEW_SAMPLES.milestone],
  ["weekly-summary", PREVIEW_SAMPLES.weeklySummary],
  ["number-one", PREVIEW_SAMPLES.numberOne],
];

await mkdir(outDir, { recursive: true });

for (const [slug, fn] of samples) {
  const { html, subject } = fn();
  await writeFile(join(outDir, `${slug}.html`), html, "utf8");
  await writeFile(join(outDir, `${slug}.subject.txt`), `${subject}\n`, "utf8");
}

let playwright;
try {
  playwright = await import("playwright");
} catch (_err) {
  console.warn("playwright not installed; HTML previews written only.");
  process.exit(0);
}

const { chromium } = playwright;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 900 } });

for (const [slug] of samples) {
  const fileUrl = pathToFileURL(join(outDir, `${slug}.html`)).href;
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outDir, `${slug}.png`), fullPage: true });
}

await browser.close();
console.log(`Wrote previews to ${outDir}`);
