/**
 * World Word — smart phrase sense guard
 *
 * Layers (reusability / reliability / security / accountability / accessibility):
 * 1. Normalize + structural bounds (boundary validation)
 * 2. Real-word check via Wiktionary (reject invented tokens)
 * 3. LanguageTool spelling / repetition (reject gibberish)
 * 4. Local sense heuristics (content words, stopword soup, POS)
 * 5. Clear error codes for UI + server parity
 */
(function (root) {
  "use strict";

  const MIN_WORDS = 2;
  const MAX_WORDS = 8;
  const MAX_PHRASE_CHARS = 80;
  const MAX_WORD_CHARS = 24;
  const MIN_LANG_CONFIDENCE = 0.55;

  const STOPWORDS = new Set(
    [
      "a", "an", "the", "and", "or", "but", "if", "of", "at", "by", "for",
      "with", "about", "against", "between", "into", "through", "during",
      "before", "after", "above", "below", "to", "from", "up", "down", "in",
      "out", "on", "off", "over", "under", "again", "further", "then", "once",
      "here", "there", "when", "where", "why", "how", "all", "any", "both",
      "each", "few", "more", "most", "other", "some", "such", "no", "nor",
      "not", "only", "own", "same", "so", "than", "too", "very", "can",
      "will", "just", "don", "should", "now", "is", "am", "are", "was",
      "were", "be", "been", "being", "have", "has", "had", "do", "does",
      "did", "having", "i", "me", "my", "we", "our", "you", "your", "he",
      "she", "it", "they", "them", "his", "her", "its", "their", "this",
      "that", "these", "those", "as",
    ]
  );

  const CONTENT_POS = new Set([
    "Noun",
    "Verb",
    "Adjective",
    "Adverb",
    "Interjection",
    "Proper noun",
    "Numeral",
  ]);

  const IGNORE_LT_RULES = new Set([
    "UPPERCASE_SENTENCE_START",
    "WHITESPACE_RULE",
    "EN_QUOTES",
    "COMMA_PARENTHESIS_WHITESPACE",
  ]);

  function normalizePhrase(raw) {
    return String(raw || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function tokenize(normalized) {
    if (!normalized) return [];
    return normalized.split(" ").filter(Boolean);
  }

  function structuralCheck(normalized) {
    if (!normalized) {
      return { ok: false, code: "EMPTY_PHRASE", error: "Please enter a phrase." };
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
    const words = tokenize(normalized);
    if (words.length < MIN_WORDS) {
      return {
        ok: false,
        code: "TOO_FEW_WORDS",
        error: `Phrases need at least ${MIN_WORDS} words (or use Word mode).`,
      };
    }
    if (words.length > MAX_WORDS) {
      return {
        ok: false,
        code: "TOO_MANY_WORDS",
        error: `Keep phrases to ${MAX_WORDS} words or fewer.`,
      };
    }
    for (const w of words) {
      if (w.length > MAX_WORD_CHARS) {
        return {
          ok: false,
          code: "WORD_TOO_LONG",
          error: `Each word must be ${MAX_WORD_CHARS} letters or fewer.`,
        };
      }
    }
    const unique = new Set(words);
    if (unique.size === 1 && words.length >= 3) {
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
    if (content.length / words.length < 0.25 && words.length >= 4) {
      return {
        ok: false,
        code: "STOPWORD_SOUP",
        error: "That reads like filler, not a meaningful phrase.",
      };
    }
    return { ok: true, words, contentWordCount: content.length };
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const err = new Error(`Request failed (${response.status})`);
      err.status = response.status;
      throw err;
    }
    return response.json();
  }

  async function lookupWiktionary(word) {
    const url =
      "https://en.wiktionary.org/api/rest_v1/page/definition/" +
      encodeURIComponent(word);
    try {
      const data = await fetchJson(url, {
        headers: { Accept: "application/json" },
      });
      const en = Array.isArray(data.en) ? data.en : [];
      if (en.length === 0) {
        return { found: false, partsOfSpeech: [] };
      }
      const partsOfSpeech = en
        .map((entry) => String(entry.partOfSpeech || "").trim())
        .filter(Boolean);
      return { found: true, partsOfSpeech };
    } catch (err) {
      if (err && err.status === 404) {
        return { found: false, partsOfSpeech: [] };
      }
      // Network / API flake — do not hard-fail the whole phrase on one miss
      return { found: null, partsOfSpeech: [], softError: true };
    }
  }

  async function checkAllWordsReal(words) {
    const results = await Promise.all(words.map((w) => lookupWiktionary(w)));
    const missing = [];
    const parts = [];
    let softFailures = 0;
    results.forEach((result, idx) => {
      if (result.found === false) missing.push(words[idx]);
      if (result.softError) softFailures += 1;
      parts.push(...result.partsOfSpeech);
    });
    if (missing.length > 0) {
      const shown = missing
        .slice(0, 3)
        .map((w) => w.toUpperCase())
        .join(", ");
      return {
        ok: false,
        code: "UNKNOWN_WORD",
        error: `${shown} ${
          missing.length === 1 ? "is" : "are"
        } not a real English word — phrases cannot be gibberish.`,
        missing,
      };
    }
    const hasContentPos = parts.some((pos) => CONTENT_POS.has(pos));
    // If Wiktionary was soft-failing for everything, skip POS gate
    if (softFailures < words.length && parts.length > 0 && !hasContentPos) {
      return {
        ok: false,
        code: "NO_CONTENT_POS",
        error: "That phrase has no real noun/verb/adjective — try meaningful wording.",
      };
    }
    return { ok: true, partsOfSpeech: parts };
  }

  async function languageToolCheck(phrase) {
    try {
      const body = new URLSearchParams({
        text: phrase,
        language: "en-US",
      });
      const data = await fetchJson("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const confidence = Number(
        data.language?.detectedLanguage?.confidence ?? 1
      );
      const matches = Array.isArray(data.matches) ? data.matches : [];
      const spelling = matches.filter((m) => {
        const id = String(m.rule?.id || "");
        const issue = String(m.rule?.issueType || "");
        const shortMsg = String(m.shortMessage || "");
        if (IGNORE_LT_RULES.has(id)) return false;
        return (
          issue.toLowerCase() === "misspelling" ||
          /spelling/i.test(shortMsg) ||
          id.includes("MORFOLOGIK") ||
          id.includes("HUNSPELL")
        );
      });
      const repetition = matches.filter((m) =>
        String(m.rule?.id || "").includes("REPETITION")
      );

      if (confidence > 0 && confidence < MIN_LANG_CONFIDENCE) {
        return {
          ok: false,
          code: "NOT_ENGLISH_SENSE",
          error: "That doesn’t look like coherent English — try a real phrase.",
          confidence,
        };
      }
      if (spelling.length > 0) {
        const bad = spelling
          .slice(0, 2)
          .map((m) => phrase.slice(m.offset, m.offset + m.length).toUpperCase())
          .filter(Boolean);
        return {
          ok: false,
          code: "SPELLING_GIBBERISH",
          error:
            bad.length > 0
              ? `${bad.join(", ")} looks like gibberish — use real spelling.`
              : "That phrase has misspelled / nonsense words.",
          confidence,
        };
      }
      if (repetition.length > 0) {
        return {
          ok: false,
          code: "PHRASE_REPETITION",
          error: "That phrase repeats itself in a nonsensical way.",
          confidence,
        };
      }
      return { ok: true, confidence, matchCount: matches.length };
    } catch (_err) {
      // LanguageTool optional — structural + dictionary still protect
      return { ok: true, skipped: true };
    }
  }

  /**
   * Full phrase sense validation.
   * @returns {Promise<{ok:boolean, code?:string, error?:string, normalized?:string, words?:string[], displayPhrase?:string}>}
   */
  async function validatePhraseSense(rawPhrase) {
    const normalized = normalizePhrase(rawPhrase);
    const structural = structuralCheck(normalized);
    if (!structural.ok) {
      return structural;
    }

    const words = structural.words;
    const [dictResult, ltResult] = await Promise.all([
      checkAllWordsReal(words),
      languageToolCheck(normalized),
    ]);

    if (!dictResult.ok) return dictResult;
    if (!ltResult.ok) return ltResult;

    return {
      ok: true,
      code: "PHRASE_OK",
      normalized,
      words,
      displayPhrase: words.map((w) => w.toUpperCase()).join(" "),
      confidence: ltResult.confidence,
      dictionarySource: "wiktionary+languagetool",
    };
  }

  function validateWordShape(rawWord) {
    const normalized = String(rawWord || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      return { ok: false, code: "EMPTY_WORD", error: "Please enter a word." };
    }
    if (!/^[a-z]+$/.test(normalized)) {
      return {
        ok: false,
        code: "INVALID_CHARACTERS",
        error: "Single word with letters only (A–Z).",
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
      normalized,
      displayWord: normalized.toUpperCase(),
    };
  }

  const api = {
    MIN_WORDS,
    MAX_WORDS,
    MAX_PHRASE_CHARS,
    normalizePhrase,
    tokenize,
    structuralCheck,
    validatePhraseSense,
    validateWordShape,
  };

  root.WorldWordPhraseSense = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
