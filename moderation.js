/**
 * World Word — discriminatory-term moderation
 *
 * Scope: hate / discriminatory slurs only.
 * Swears and general vulgarity are intentionally allowed.
 *
 * Adjustments:
 * - Edit DISCRIMINATORY_TERMS to block more terms
 * - Edit ALLOWLIST_EXCEPTIONS for false-positive overrides (checked first)
 */
(function (root) {
  "use strict";

  /** Allowlist: exact normalized forms that must always pass. */
  const ALLOWLIST_EXCEPTIONS = Object.freeze([
    // Places / demonyms that can collide with slur-adjacent spellings
    "niger",
    "nigeria",
    "nigerien",
    "nigerian",
  ]);

  /**
   * Discriminatory / hate-speech blocklist (exact match after normalize).
   * Lowercase ASCII letters only. Ordinary swear words do NOT belong here.
   */
  const DISCRIMINATORY_TERMS = Object.freeze([
    // Racial / ethnic
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

    // Religious hate compounds
    "christkiller",
    "christkillers",

    // LGBTQ+ slurs (not reclaimed identity labels like "gay")
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

    // Disability / ableist slurs (not clinical terms like "deaf" / "blind")
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

    // Hate compounds submitted as one token
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

  /** Lowercase, strip non-letters, map light leetspeak, collapse letter spam. */
  function normalizeWord(input) {
    const raw = String(input || "").toLowerCase();
    let out = "";
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (LEEET_MAP[ch]) {
        out += LEEET_MAP[ch];
      } else if (ch >= "a" && ch <= "z") {
        out += ch;
      }
    }
    return collapseRepeats(out);
  }

  /**
   * @returns {{ ok: true, normalized: string, allowedByException?: boolean }
   *   | { ok: false, code: string, message: string, normalized?: string }}
   */
  function checkWord(input) {
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
        message:
          "That word isn't allowed here. Please try a different word.",
        normalized,
      };
    }

    return { ok: true, normalized };
  }

  function shouldHideFromPublic(input) {
    const result = checkWord(input);
    return result.ok === false && result.code === "DISCRIMINATORY_WORD";
  }

  function filterLeaderboardItems(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      const word = item && (item.word || item.displayWord || "");
      return !shouldHideFromPublic(word);
    });
  }

  function sanitizeStats(statsData) {
    if (!statsData || typeof statsData !== "object") return statsData;
    const top =
      statsData.topWord ?? statsData.top_word ?? statsData.topWordDisplay;
    if (top && shouldHideFromPublic(top)) {
      return Object.assign({}, statsData, {
        topWord: "",
        top_word: "",
        topWordDisplay: "",
        topWordCount: 0,
        top_word_count: 0,
      });
    }
    return statsData;
  }

  function getBlocklist() {
    return DISCRIMINATORY_TERMS.slice();
  }

  function getAllowlist() {
    return ALLOWLIST_EXCEPTIONS.slice();
  }

  const api = {
    normalizeWord,
    checkWord,
    shouldHideFromPublic,
    filterLeaderboardItems,
    sanitizeStats,
    getBlocklist,
    getAllowlist,
    isBlocked: shouldHideFromPublic,
  };

  root.WorldWordModeration = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
