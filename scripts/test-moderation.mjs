import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const require = createRequire(import.meta.url);
const browserMod = require(path.join(root, "moderation.js"));
const serverMod = await import(
  pathToFileURL(path.join(root, "server/wordModeration.mjs")).href
);

function runSuite(label, mod) {
  // Swears allowed
  assert.equal(mod.checkWord("shit").ok, true, `${label}: swear shit allowed`);
  assert.equal(mod.checkWord("fuck").ok, true, `${label}: swear fuck allowed`);
  assert.equal(mod.checkWord("ass").ok, true, `${label}: swear ass allowed`);

  // Normal words allowed
  assert.equal(mod.checkWord("world").ok, true, `${label}: world allowed`);
  assert.equal(mod.checkWord("peace").ok, true, `${label}: peace allowed`);

  // Discriminatory blocked
  const blocked = mod.checkWord("nigger");
  assert.equal(blocked.ok, false, `${label}: slur blocked`);
  assert.equal(blocked.code, "DISCRIMINATORY_WORD", `${label}: code`);
  assert.match(blocked.message, /isn['’]?t allowed|not allowed/i, `${label}: message`);

  assert.equal(mod.checkWord("FAGGOT").ok, false, `${label}: case insensitive`);
  assert.equal(mod.checkWord("n1gger").ok, false, `${label}: leetspeak`);
  assert.equal(mod.checkWord("retard").ok, false, `${label}: ableist`);
  assert.equal(mod.checkWord("chink").ok, false, `${label}: ethnic slur`);

  // Allowlist exceptions
  assert.equal(mod.checkWord("Niger").ok, true, `${label}: Niger exception`);
  assert.equal(
    mod.checkWord("Nigeria").ok,
    true,
    `${label}: Nigeria exception`
  );
  assert.equal(
    mod.checkWord("Niger").allowedByException,
    true,
    `${label}: exception flag`
  );

  // Leaderboard / stats helpers (browser module)
  if (typeof mod.filterLeaderboardItems === "function") {
    const filtered = mod.filterLeaderboardItems([
      { word: "world", rank: 1 },
      { word: "nigger", rank: 2 },
      { word: "love", rank: 3 },
    ]);
    assert.deepEqual(
      filtered.map((x) => x.word),
      ["world", "love"],
      `${label}: leaderboard filter`
    );
  }

  if (typeof mod.sanitizeStats === "function") {
    const dirty = mod.sanitizeStats({
      topWord: "nigger",
      topWordCount: 9,
      totalSubmissions: 10,
    });
    assert.equal(dirty.topWord, "", `${label}: stats top scrubbed`);
    assert.equal(dirty.topWordCount, 0, `${label}: stats count scrubbed`);
  }
}

runSuite("browser", browserMod);
runSuite("server", serverMod);

console.log("moderation tests: ok");
