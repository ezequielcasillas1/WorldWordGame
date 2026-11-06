/**
 * Server-side discriminatory-word check for the World Word API Worker.
 *
 * Paste into /api/submit BEFORE dictionary lookup + persistence:
 *
 *   import { checkWord } from "./wordModeration.mjs";
 *   const verdict = checkWord(body.word);
 *   if (!verdict.ok) {
 *     return Response.json(
 *       { ok: false, error: verdict.message, code: verdict.code },
 *       { status: 400 }
 *     );
 *   }
 *
 * Swears are allowed. Only discriminatory / hate terms are blocked.
 * Adjust ALLOWLIST_EXCEPTIONS and DISCRIMINATORY_TERMS below as needed.
 */

export const ALLOWLIST_EXCEPTIONS = Object.freeze([
  "niger",
  "nigeria",
  "nigerien",
  "nigerian",
]);

export const DISCRIMINATORY_TERMS = Object.freeze([
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "negro",
  "negros",
  "negroes",
  "coon",
  "coons",
  "darkie",
  "darkies",
  "jigaboo",
  "jiggaboo",
  "spic",
  "spick",
  "spics",
  "wetback",
  "wetbacks",
  "beaner",
  "beaners",
  "chink",
  "chinks",
  "gook",
  "gooks",
  "jap",
  "japs",
  "paki",
  "pakis",
  "kike",
  "kikes",
  "heeb",
  "heebs",
  "raghead",
  "ragheads",
  "towelhead",
  "towelheads",
  "sandnigger",
  "sandniggers",
  "cameljockey",
  "hajji",
  "hadji",
  "honky",
  "honkie",
  "honkies",
  "whitey",
  "redskin",
  "redskins",
  "injun",
  "injuns",
  "squaw",
  "squaws",
  "gypsy",
  "gypsies",
  "gyppo",
  "gypo",
  "pikey",
  "pikies",
  "wop",
  "wops",
  "dago",
  "dagos",
  "polack",
  "polacks",
  "kraut",
  "krauts",
  "chinaman",
  "chinamen",
  "christkiller",
  "christkillers",
  "fag",
  "fags",
  "faggot",
  "faggots",
  "fagot",
  "fagots",
  "dyke",
  "dykes",
  "tranny",
  "trannies",
  "shemale",
  "shemales",
  "ladyboy",
  "ladyboys",
  "retard",
  "retards",
  "retarded",
  "spaz",
  "spazz",
  "spastic",
  "mongoloid",
  "mongoloids",
  "cripple",
  "cripples",
  "killall",
  "whitepower",
  "hitlerdidnothingwrong",
]);

const allowSet = new Set(ALLOWLIST_EXCEPTIONS);
const blockSet = new Set(DISCRIMINATORY_TERMS);

const LEEET_MAP = Object.freeze({
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
});

function collapseRepeats(value) {
  return value.replace(/(.)\1{2,}/g, "$1$1");
}

export function normalizeWord(input) {
  const raw = String(input || "").toLowerCase();
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (LEEET_MAP[ch]) out += LEEET_MAP[ch];
    else if (ch >= "a" && ch <= "z") out += ch;
  }
  return collapseRepeats(out);
}

export function checkWord(input) {
  const normalized = normalizeWord(input);
  if (!normalized) {
    return {
      ok: false,
      code: "EMPTY_WORD",
      message: "Please enter a word first!",
    };
  }
  if (allowSet.has(normalized)) {
    return { ok: true, normalized, allowedByException: true };
  }
  if (blockSet.has(normalized)) {
    return {
      ok: false,
      code: "DISCRIMINATORY_WORD",
      message: "That word isn't allowed here. Please try a different word.",
      normalized,
    };
  }
  return { ok: true, normalized };
}

export function shouldHideFromPublic(input) {
  const result = checkWord(input);
  return result.ok === false && result.code === "DISCRIMINATORY_WORD";
}
