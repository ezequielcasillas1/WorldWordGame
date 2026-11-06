import { EMAIL_REGEX } from "./constants.js";

const MAX_EMAIL_LEN = 254;
const MAX_WORD_LEN = 80;

export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_EMAIL_LEN) return null;
  if (!EMAIL_REGEX.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  return trimmed;
}

export function normalizeTrackedWord(raw) {
  if (typeof raw !== "string") return null;
  const word = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!word || word.length > MAX_WORD_LEN) return null;
  if (!/^[a-z]+(?: [a-z]+)*$/.test(word)) return null;
  return word;
}
