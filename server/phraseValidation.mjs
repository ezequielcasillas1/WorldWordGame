/**
 * Drop-in phrase validation for the Cloudflare Worker `/api/submit`.
 *
 * Usage sketch inside the Worker submit handler:
 *   import { validateSubmission } from "./phraseValidation.mjs";
 *   const result = await validateSubmission(body);
 *   if (!result.ok) return jsonError(result);
 *
 * Keeps word mode unchanged; enables type:"phrase" or multi-word `word`.
 */

const MIN_WORDS = 2;
const MAX_WORDS = 8;
const MAX_PHRASE_CHARS = 80;
const MAX_WORD_CHARS = 24;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "at", "by", "for", "with",
  "to", "from", "in", "on", "off", "over", "under", "as", "is", "am", "are",
  "was", "were", "be", "been", "being", "i", "me", "my", "we", "you", "he",
  "she", "it", "they", "this", "that", "these", "those", "not", "no", "so",
]);

export function normalizeEntry(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function detectMode(body = {}) {
  const explicit = String(body.type || body.mode || "").toLowerCase();
  if (explicit === "phrase" || explicit === "word") return explicit;
  const text = normalizeEntry(body.word || body.phrase || body.text || "");
  return text.includes(" ") ? "phrase" : "word";
}

export function validateWordLocal(raw) {
  const normalized = normalizeEntry(raw);
  if (!normalized) {
    return { ok: false, code: "EMPTY_WORD", error: "Please enter a word to submit." };
  }
  if (/\s/.test(normalized)) {
    return {
      ok: false,
      code: "INVALID_CHARACTERS",
      error: "Single word with letters only (A–Z) — no spaces, numbers, or symbols.",
    };
  }
  if (!/^[a-z]+$/.test(normalized)) {
    return {
      ok: false,
      code: "INVALID_CHARACTERS",
      error: "Single word with letters only (A–Z) — no spaces, numbers, or symbols.",
    };
  }
  if (normalized.length > 50) {
    return {
      ok: false,
      code: "WORD_TOO_LONG",
      error: "Word must be 50 characters or fewer.",
    };
  }
  return {
    ok: true,
    mode: "word",
    key: normalized,
    display: normalized.toUpperCase(),
  };
}

export function validatePhraseLocal(raw) {
  const normalized = normalizeEntry(raw);
  if (!normalized) {
    return { ok: false, code: "EMPTY_PHRASE", error: "Please enter a phrase to submit." };
  }
  if (normalized.length > MAX_PHRASE_CHARS) {
    return {
      ok: false,
      code: "PHRASE_TOO_LONG",
      error: `Phrases must be ${MAX_PHRASE_CHARS} characters or fewer.`,
    };
  }
  if (!/^[a-z]+(?: [a-z]+)+$/.test(normalized)) {
    return {
      ok: false,
      code: "INVALID_PHRASE_CHARS",
      error: "Phrases: letters and single spaces only (A–Z).",
    };
  }
  const words = normalized.split(" ");
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) {
    return {
      ok: false,
      code: "PHRASE_WORD_COUNT",
      error: `Phrases need ${MIN_WORDS}–${MAX_WORDS} words.`,
    };
  }
  if (words.some((w) => w.length > MAX_WORD_CHARS)) {
    return {
      ok: false,
      code: "WORD_TOO_LONG",
      error: `Each word must be ${MAX_WORD_CHARS} letters or fewer.`,
    };
  }
  if (new Set(words).size === 1 && words.length >= 3) {
    return {
      ok: false,
      code: "REPEATED_GIBBERISH",
      error: "That phrase just repeats the same word — try real wording.",
    };
  }
  const content = words.filter((w) => !STOPWORDS.has(w));
  if (content.length === 0) {
    return {
      ok: false,
      code: "NO_CONTENT_WORDS",
      error: "Add a real content word — not only little words like “the/and/of”.",
    };
  }
  return {
    ok: true,
    mode: "phrase",
    key: normalized,
    display: words.map((w) => w.toUpperCase()).join(" "),
    words,
  };
}

/**
 * Validate request body for word or phrase.
 * Dictionary / LanguageTool checks should still run in the Worker after this.
 */
export function validateSubmission(body = {}) {
  const mode = detectMode(body);
  const text = body.word || body.phrase || body.text || "";
  if (mode === "phrase") {
    return validatePhraseLocal(text);
  }
  return validateWordLocal(text);
}

export const PHRASE_LIMITS = Object.freeze({
  MIN_WORDS,
  MAX_WORDS,
  MAX_PHRASE_CHARS,
  MAX_WORD_CHARS,
});
