import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(root, "favicon.svg"));

await sharp(svg).resize(32, 32).png().toFile(path.join(root, "favicon-32x32.png"));
await sharp(svg).resize(16, 16).png().toFile(path.join(root, "favicon-16x16.png"));
await sharp(svg).resize(180, 180).png().toFile(path.join(root, "apple-touch-icon.png"));
await sharp(svg).resize(192, 192).png().toFile(path.join(root, "icons/icon-192.png"));
await sharp(svg).resize(512, 512).png().toFile(path.join(root, "icons/icon-512.png"));
console.log("generate:assets ok");
