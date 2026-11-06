#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  "index.html",
  "about.html",
  "app.js",
  "config.js",
  "analytics.js",
  "styles.css",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "og-image.png",
  "favicon.svg",
];

let failed = false;
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error("Missing:", file);
    failed = true;
  }
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const checks = [
  ['name="description"', "meta description"],
  ['rel="canonical"', "canonical link"],
  ['property="og:title"', "Open Graph title"],
  ['name="twitter:card"', "Twitter card"],
  ['application/ld+json', "JSON-LD"],
];
for (const [needle, label] of checks) {
  if (!index.includes(needle)) {
    console.error("index.html missing:", label);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log("verify: ok");
