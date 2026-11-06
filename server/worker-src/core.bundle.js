var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/src/http.js
var SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Visitor-Id, Visitor-Id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};
var MAX_BODY_CHARS = 16 * 1024;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS
    }
  });
}
__name(json, "json");
function empty(status = 204) {
  return new Response(null, { status, headers: SECURITY_HEADERS });
}
__name(empty, "empty");
async function readJsonBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
    return { ok: false, error: "Request body is too large.", code: "BODY_TOO_LARGE" };
  }
  let text = "";
  try {
    text = await request.text();
  } catch (_err) {
    return { ok: false, error: "Could not read the request body.", code: "BODY_UNREADABLE" };
  }
  if (text.length > MAX_BODY_CHARS) {
    return { ok: false, error: "Request body is too large.", code: "BODY_TOO_LARGE" };
  }
  if (!text.trim()) {
    return { ok: true, body: {} };
  }
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, error: "Request body must be a JSON object.", code: "INVALID_JSON" };
    }
    return { ok: true, body };
  } catch (_err) {
    return { ok: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" };
  }
}
__name(readJsonBody, "readJsonBody");

// worker/src/storage.js
var SEED_WORDS = [
  ["world", 42],
  ["hello", 36],
  ["love", 31],
  ["peace", 25],
  ["music", 21],
  ["game", 18],
  ["dream", 15],
  ["light", 12],
  ["hope", 9],
  ["magic", 6]
];
function createRepository(db) {
  async function ensureSeed() {
    const row = await db.prepare("SELECT COUNT(*) AS total FROM submissions").first();
    if (Number(row?.total || 0) > 0) return;
    const claim = await db.prepare("INSERT INTO app_meta (key, value) VALUES ('seeded', '1') ON CONFLICT(key) DO NOTHING").run();
    if (Number(claim.meta?.changes || 0) !== 1) return;
    try {
      const base = Date.parse("2026-11-04T12:00:00.000Z");
      const statements = [];
      let offset = 0;
      for (const [word, count] of SEED_WORDS) {
        for (let i = 0; i < count; i += 1) {
          offset += 1;
          const timestamp = new Date(base + offset * 15e3).toISOString();
          const visitorId = `seed-visitor-${i % 7 + 1}`;
          statements.push(
            db.prepare("INSERT INTO submissions (word, visitor_id, timestamp) VALUES (?, ?, ?)").bind(word, visitorId, timestamp)
          );
        }
      }
      for (let i = 0; i < statements.length; i += 40) {
        await db.batch(statements.slice(i, i + 40));
      }
    } catch (err) {
      await db.prepare("DELETE FROM app_meta WHERE key = 'seeded'").run();
      throw err;
    }
  }
  __name(ensureSeed, "ensureSeed");
  async function getStats() {
    await ensureSeed();
    const statsRow = await db.prepare("SELECT COUNT(*) AS total_submissions, COUNT(DISTINCT word) AS unique_words FROM submissions").first();
    const topRow = await db.prepare(
      "SELECT word, COUNT(*) AS count FROM submissions GROUP BY word ORDER BY count DESC, word ASC LIMIT 1"
    ).first();
    const totalSubmissions = Number(statsRow?.total_submissions || 0);
    const uniqueWords = Number(statsRow?.unique_words || 0);
    const topWord = topRow?.word ? String(topRow.word) : "";
    const topWordCount = Number(topRow?.count || 0);
    return {
      totalSubmissions,
      total_submissions: totalSubmissions,
      uniqueWords,
      unique_words: uniqueWords,
      uniqueWordCount: uniqueWords,
      topWord,
      top_word: topWord,
      topWordDisplay: topWord ? topWord.toUpperCase() : "\u2014",
      topWordCount,
      top_word_count: topWordCount
    };
  }
  __name(getStats, "getStats");
  async function recordSubmission(word, visitorId, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
    await ensureSeed();
    await db.prepare("INSERT INTO submissions (word, visitor_id, timestamp) VALUES (?, ?, ?)").bind(word, visitorId, timestamp).run();
    const countRow = await db.prepare("SELECT COUNT(*) AS count FROM submissions WHERE word = ?").bind(word).first();
    const rankRow = await db.prepare(
      `SELECT rank FROM (
           SELECT word, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, word ASC) AS rank
           FROM submissions
           GROUP BY word
         ) WHERE word = ?`
    ).bind(word).first();
    const stats = await getStats();
    const count = Number(countRow?.count || 1);
    const rank = Number(rankRow?.rank || 1);
    const sharePercent = stats.totalSubmissions > 0 ? Number((count / stats.totalSubmissions * 100).toFixed(2)) : 100;
    return {
      word,
      displayWord: word.toUpperCase(),
      count,
      timesSaid: count,
      rank,
      globalRank: rank,
      totalSubmissions: stats.totalSubmissions,
      uniqueWords: stats.uniqueWords,
      sharePercent,
      visitorId,
      timestamp
    };
  }
  __name(recordSubmission, "recordSubmission");
  async function getLeaderboard(limit = 50, visitorId = null) {
    await ensureSeed();
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const stats = await getStats();
    const listed = await db.prepare(
      `SELECT word, COUNT(*) AS count, MAX(timestamp) AS last_submitted_at
         FROM submissions
         GROUP BY word
         ORDER BY count DESC, word ASC
         LIMIT ?`
    ).bind(safeLimit).all();
    let recentVisitorWord = null;
    if (visitorId) {
      const recentRow = await db.prepare("SELECT word FROM submissions WHERE visitor_id = ? ORDER BY id DESC LIMIT 1").bind(visitorId).first();
      if (recentRow?.word) recentVisitorWord = String(recentRow.word);
    }
    const rows = listed.results || [];
    const maxCount = rows.length > 0 ? Number(rows[0].count) : 1;
    const total = stats.totalSubmissions || 1;
    const items = rows.map((row, index) => {
      const rank = index + 1;
      const count = Number(row.count);
      const word = String(row.word);
      const sharePercent = Number((count / total * 100).toFixed(1));
      const barPercent = Number(Math.max(4, count / maxCount * 100).toFixed(1));
      const medal = rank === 1 ? "\u{1F947}" : rank === 2 ? "\u{1F948}" : rank === 3 ? "\u{1F949}" : "";
      return {
        rank,
        word,
        displayWord: word.toUpperCase(),
        count,
        share: sharePercent,
        sharePercent,
        percentage: sharePercent,
        barPercent,
        medal,
        lastSubmittedAt: row.last_submitted_at,
        isRecentVisitorWord: Boolean(recentVisitorWord && recentVisitorWord === word)
      };
    });
    return {
      leaderboard: items,
      items,
      limit: safeLimit,
      totalSubmissions: stats.totalSubmissions,
      uniqueWords: stats.uniqueWords,
      topWord: stats.topWord,
      recentWord: recentVisitorWord
    };
  }
  __name(getLeaderboard, "getLeaderboard");
  async function getCachedWord(word) {
    const row = await db.prepare("SELECT word, is_valid, source, definition, checked_at FROM dictionary_cache WHERE word = ?").bind(word).first();
    if (!row) return null;
    return {
      word: String(row.word),
      exists: Number(row.is_valid) === 1,
      source: String(row.source),
      definition: row.definition ? String(row.definition) : null,
      checkedAt: String(row.checked_at)
    };
  }
  __name(getCachedWord, "getCachedWord");
  async function setCachedWord(word, exists, source, definition = null) {
    await db.prepare(
      `INSERT INTO dictionary_cache (word, is_valid, source, definition, checked_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(word) DO UPDATE SET
           is_valid = excluded.is_valid,
           source = excluded.source,
           definition = excluded.definition,
           checked_at = excluded.checked_at`
    ).bind(word, exists ? 1 : 0, source, definition || null, (/* @__PURE__ */ new Date()).toISOString()).run();
  }
  __name(setCachedWord, "setCachedWord");
  return {
    ensureSeed,
    recordSubmission,
    getStats,
    getLeaderboard,
    getCachedWord,
    setCachedWord
  };
}
__name(createRepository, "createRepository");

// worker/src/validate.js
var MAX_WORD_LENGTH = 50;
var MAX_PHRASE_LENGTH = 80;
var MIN_PHRASE_WORDS = 2;
var MAX_PHRASE_WORDS = 8;
var MAX_PHRASE_WORD_LENGTH = 24;
var LETTERS_ONLY_REGEX = /^[a-z]+$/;
var PHRASE_REGEX = /^[a-z]+(?: [a-z]+)+$/;
var HAS_VOWEL_REGEX = /[aeiouy]/i;
var TRIPLE_REPEAT_REGEX = /([a-z])\1\1/i;
var KEYBOARD_MASH_REGEX = /(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm)/i;
var SAFE_VISITOR_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
var PHRASE_STOPWORDS = /* @__PURE__ */ new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "at", "by", "for", "with",
  "to", "from", "in", "on", "off", "over", "under", "as", "is", "am", "are",
  "was", "were", "be", "been", "being", "i", "me", "my", "we", "you", "he",
  "she", "it", "they", "this", "that", "these", "those", "not", "no", "so"
]);
function normalizeAndValidateWord(rawInput) {
  if (typeof rawInput !== "string" && typeof rawInput !== "number") {
    return {
      ok: false,
      error: "Please enter a word to submit.",
      code: "EMPTY_WORD"
    };
  }
  const stripped = String(rawInput).trim().toLowerCase();
  if (!stripped) {
    return {
      ok: false,
      error: "Please enter a word before submitting.",
      code: "EMPTY_WORD"
    };
  }
  if (stripped.length > MAX_WORD_LENGTH) {
    return {
      ok: false,
      error: `Word must be ${MAX_WORD_LENGTH} characters or fewer.`,
      code: "WORD_TOO_LONG"
    };
  }
  if (!LETTERS_ONLY_REGEX.test(stripped)) {
    return {
      ok: false,
      error: "Single word with letters only (A\u2013Z) \u2014 no spaces, numbers, or symbols.",
      code: "INVALID_CHARACTERS"
    };
  }
  return { ok: true, type: "word", word: stripped };
}
__name(normalizeAndValidateWord, "normalizeAndValidateWord");
function normalizeAndValidatePhrase(rawInput) {
  if (typeof rawInput !== "string" && typeof rawInput !== "number") {
    return {
      ok: false,
      error: "Please enter a phrase to submit.",
      code: "EMPTY_PHRASE"
    };
  }
  const stripped = String(rawInput).trim().replace(/\s+/g, " ").toLowerCase();
  if (!stripped) {
    return {
      ok: false,
      error: "Please enter a phrase before submitting.",
      code: "EMPTY_PHRASE"
    };
  }
  if (stripped.length > MAX_PHRASE_LENGTH) {
    return {
      ok: false,
      error: `Phrases must be ${MAX_PHRASE_LENGTH} characters or fewer.`,
      code: "PHRASE_TOO_LONG"
    };
  }
  if (!PHRASE_REGEX.test(stripped)) {
    return {
      ok: false,
      error: "Phrases: letters and single spaces only (A\u2013Z).",
      code: "INVALID_PHRASE_CHARS"
    };
  }
  const words = stripped.split(" ");
  if (words.length < MIN_PHRASE_WORDS || words.length > MAX_PHRASE_WORDS) {
    return {
      ok: false,
      error: `Phrases need ${MIN_PHRASE_WORDS}\u2013${MAX_PHRASE_WORDS} words.`,
      code: "PHRASE_WORD_COUNT"
    };
  }
  if (words.some((w) => w.length > MAX_PHRASE_WORD_LENGTH)) {
    return {
      ok: false,
      error: `Each word must be ${MAX_PHRASE_WORD_LENGTH} letters or fewer.`,
      code: "WORD_TOO_LONG"
    };
  }
  if (new Set(words).size === 1 && words.length >= 3) {
    return {
      ok: false,
      error: "That phrase just repeats the same word \u2014 try real wording.",
      code: "REPEATED_GIBBERISH"
    };
  }
  const content = words.filter((w) => !PHRASE_STOPWORDS.has(w));
  if (content.length === 0) {
    return {
      ok: false,
      error: "Add a real content word \u2014 not only little words like \u201Cthe/and/of\u201D.",
      code: "NO_CONTENT_WORDS"
    };
  }
  return { ok: true, type: "phrase", word: stripped, words };
}
__name(normalizeAndValidatePhrase, "normalizeAndValidatePhrase");
function normalizeAndValidateEntry(rawInput, explicitType) {
  const modeHint = String(explicitType || "").toLowerCase();
  const preview = String(rawInput ?? "").trim().replace(/\s+/g, " ");
  const wantsPhrase = modeHint === "phrase" || preview.includes(" ");
  if (wantsPhrase) {
    return normalizeAndValidatePhrase(rawInput);
  }
  return normalizeAndValidateWord(rawInput);
}
__name(normalizeAndValidateEntry, "normalizeAndValidateEntry");
function failsPatternFilter(word) {
  return !HAS_VOWEL_REGEX.test(word) || TRIPLE_REPEAT_REGEX.test(word) || KEYBOARD_MASH_REGEX.test(word);
}
__name(failsPatternFilter, "failsPatternFilter");
async function languageToolSenseCheck(phrase) {
  try {
    const body = new URLSearchParams({ text: phrase, language: "en-US" });
    const response = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      return { ok: true, skipped: true };
    }
    const data = await response.json();
    const confidence = Number(data.language?.detectedLanguage?.confidence ?? 1);
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const ignore = /* @__PURE__ */ new Set([
      "UPPERCASE_SENTENCE_START",
      "WHITESPACE_RULE",
      "EN_QUOTES",
      "COMMA_PARENTHESIS_WHITESPACE"
    ]);
    const spelling = matches.filter((m) => {
      const id = String(m.rule?.id || "");
      const issue = String(m.rule?.issueType || "");
      const shortMsg = String(m.shortMessage || "");
      if (ignore.has(id)) return false;
      return issue.toLowerCase() === "misspelling" || /spelling/i.test(shortMsg) || id.includes("MORFOLOGIK") || id.includes("HUNSPELL");
    });
    const repetition = matches.filter((m) => String(m.rule?.id || "").includes("REPETITION"));
    if (confidence > 0 && confidence < 0.55) {
      return {
        ok: false,
        code: "NOT_ENGLISH_SENSE",
        error: "That doesn\u2019t look like coherent English \u2014 try a real phrase."
      };
    }
    if (spelling.length > 0) {
      return {
        ok: false,
        code: "SPELLING_GIBBERISH",
        error: "That phrase has misspelled / nonsense words."
      };
    }
    if (repetition.length > 0) {
      return {
        ok: false,
        code: "PHRASE_REPETITION",
        error: "That phrase repeats itself in a nonsensical way."
      };
    }
    return { ok: true, confidence };
  } catch (_err) {
    return { ok: true, skipped: true };
  }
}
__name(languageToolSenseCheck, "languageToolSenseCheck");
async function verifyPhraseExists(words, repo) {
  const checks = [];
  for (const token of words) {
    const result = await verifyWordExists(token, repo);
    checks.push({ token, ...result });
    if (!result.exists) {
      return {
        exists: false,
        source: result.source,
        definition: null,
        missing: token
      };
    }
  }
  return {
    exists: true,
    source: checks.map((c) => c.source).filter(Boolean).join("+") || "phrase-words",
    definition: null,
    missing: null
  };
}
__name(verifyPhraseExists, "verifyPhraseExists");
function headerValue(request, name) {
  const raw = request.headers.get(name);
  if (!raw) return "";
  return raw.split(",")[0].trim();
}
__name(headerValue, "headerValue");
function resolveVisitorId(request, body) {
  const headerVal = headerValue(request, "x-visitor-id") || headerValue(request, "visitor-id") || (body && typeof body.visitorId === "string" ? body.visitorId : "") || (body && typeof body.visitor_id === "string" ? body.visitor_id : "");
  const trimmed = String(headerVal || "").trim();
  if (SAFE_VISITOR_REGEX.test(trimmed)) return trimmed;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (sanitized.length > 0) return sanitized;
  return `anon-${crypto.randomUUID().slice(0, 12)}`;
}
__name(resolveVisitorId, "resolveVisitorId");

// worker/src/local-words.json
var local_words_default = ["about", "above", "across", "action", "active", "actor", "actual", "add", "adventure", "afraid", "after", "again", "against", "age", "ago", "agree", "air", "alive", "all", "allow", "almost", "alone", "along", "already", "also", "always", "amazing", "amber", "among", "amount", "ancient", "angel", "anger", "angry", "animal", "another", "answer", "any", "anyone", "anything", "apple", "april", "arch", "area", "argue", "arm", "around", "arrive", "arrow", "art", "artist", "ask", "asleep", "atlas", "atom", "attack", "august", "autumn", "awake", "away", "awesome", "baby", "back", "bacon", "bad", "bag", "bake", "balance", "ball", "balloon", "banana", "band", "bank", "bar", "bark", "barn", "base", "basic", "basket", "bath", "battle", "beach", "beam", "bean", "bear", "beard", "beast", "beat", "beautiful", "beauty", "because", "become", "bed", "bee", "beef", "before", "begin", "behind", "believe", "bell", "belong", "below", "belt", "bench", "bend", "berry", "beside", "best", "better", "between", "beyond", "bicycle", "big", "bike", "bill", "bird", "birth", "birthday", "bit", "bite", "bitter", "black", "blade", "blame", "blank", "blanket", "blast", "blaze", "bleed", "blend", "bless", "blind", "blink", "block", "blood", "bloom", "blossom", "blow", "blue", "board", "boat", "body", "boil", "bold", "bolt", "bomb", "bond", "bone", "bonus", "book", "boost", "boot", "border", "born", "borrow", "boss", "both", "bother", "bottle", "bottom", "bounce", "bound", "bow", "bowl", "box", "boy", "brain", "branch", "brand", "brave", "bread", "break", "breakfast", "breath", "breathe", "breeze", "brick", "bridge", "brief", "bright", "bring", "broad", "broken", "bronze", "brook", "brother", "brown", "brush", "bubble", "bucket", "buddy", "budget", "build", "building", "bulb", "bullet", "bunch", "bundle", "burger", "burn", "burst", "bury", "bus", "bush", "business", "busy", "butter", "butterfly", "button", "buy", "cabin", "cable", "cactus", "cafe", "cage", "cake", "call", "calm", "camel", "camera", "camp", "can", "canal", "cancel", "candle", "candy", "canvas", "canyon", "cap", "capable", "capital", "captain", "capture", "car", "carbon", "card", "care", "career", "careful", "cargo", "carpet", "carrot", "carry", "cart", "carve", "case", "cash", "castle", "cat", "catch", "cattle", "cause", "cave", "ceiling", "celebrate", "cell", "center", "century", "cereal", "certain", "chain", "chair", "chalk", "challenge", "champion", "chance", "change", "channel", "chaos", "chapter", "character", "charge", "charm", "chart", "chase", "cheap", "cheat", "check", "cheek", "cheer", "cheese", "chef", "cherry", "chess", "chest", "chicken", "chief", "child", "chill", "chimney", "chin", "chip", "chocolate", "choice", "choose", "chop", "chorus", "church", "cinema", "circle", "circus", "citizen", "city", "civic", "civil", "claim", "clap", "class", "classic", "clean", "clear", "clerk", "clever", "click", "client", "cliff", "climate", "climb", "clinic", "clock", "close", "closet", "cloth", "cloud", "cloudy", "clown", "club", "clue", "cluster", "coach", "coal", "coast", "coat", "cobalt", "code", "coffee", "coin", "cold", "collar", "collect", "college", "color", "column", "comb", "combine", "come", "comedy", "comet", "comfort", "comic", "command", "common", "company", "compare", "compass", "compete", "complete", "complex", "computer", "concert", "confirm", "connect", "consider", "constant", "contact", "contain", "content", "contest", "continue", "control", "cook", "cookie", "cool", "copper", "copy", "coral", "cord", "core", "corn", "corner", "correct", "cosmos", "cost", "cottage", "cotton", "couch", "cough", "could", "count", "country", "county", "couple", "courage", "course", "court", "cousin", "cover", "cow", "cozy", "crack", "cradle", "craft", "crane", "crash", "crate", "crawl", "crazy", "cream", "create", "creature", "credit", "creek", "crew", "cricket", "crime", "crimson", "crisp", "critic", "crop", "cross", "crowd", "crown", "crucial", "cruel", "cruise", "crumb", "crush", "crust", "cry", "crystal", "cube", "culture", "cup", "cupboard", "cure", "curious", "curl", "current", "curtain", "curve", "cushion", "custom", "cute", "cycle", "daily", "dairy", "daisy", "damage", "dance", "danger", "daring", "dark", "darkness", "dart", "dash", "data", "date", "daughter", "dawn", "day", "daylight", "dazzle", "dead", "deal", "dear", "death", "debate", "debt", "decade", "december", "decide", "decision", "deck", "declare", "decline", "decorate", "deep", "deer", "defeat", "defend", "define", "degree", "delay", "delicate", "delight", "deliver", "delta", "demand", "denim", "dense", "dentist", "deny", "depart", "depend", "deposit", "depth", "desert", "deserve", "design", "desire", "desk", "dessert", "destiny", "destroy", "detail", "detect", "develop", "device", "devote", "diamond", "diary", "dice", "dictionary", "diet", "differ", "different", "difficult", "dig", "digital", "dignity", "dime", "dinner", "dinosaur", "direct", "dirt", "dirty", "discover", "discuss", "disease", "dish", "disk", "display", "distance", "distant", "district", "dive", "divide", "divine", "dizzy", "doctor", "document", "dog", "doll", "dollar", "dolphin", "domain", "dome", "donate", "donkey", "door", "double", "doubt", "dough", "dove", "down", "dozen", "draft", "dragon", "drain", "drama", "draw", "drawer", "dread", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "driver", "drop", "drum", "dry", "duck", "due", "duet", "dull", "dune", "during", "dusk", "dust", "duty", "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "ease", "east", "easy", "eat", "echo", "eclipse", "ecology", "economy", "edge", "edit", "educate", "effect", "effort", "egg", "eight", "either", "elbow", "elder", "elect", "electric", "elegant", "element", "elephant", "elevate", "eleven", "elite", "else", "embark", "ember", "embrace", "emerald", "emerge", "emotion", "emperor", "empire", "employ", "empty", "enable", "enchant", "end", "endless", "endure", "enemy", "energy", "engage", "engine", "enjoy", "enough", "enter", "entire", "entry", "envelope", "envy", "epic", "equal", "equip", "era", "erase", "error", "escape", "essay", "essence", "estate", "eternal", "ethic", "even", "evening", "event", "ever", "every", "evidence", "evil", "evolve", "exact", "exam", "example", "excite", "excuse", "exercise", "exist", "exit", "exotic", "expand", "expect", "expert", "explain", "explore", "export", "express", "extend", "extra", "eye", "fable", "fabric", "face", "fact", "factor", "factory", "fade", "fail", "faint", "fair", "fairy", "faith", "faithful", "falcon", "fall", "false", "fame", "familiar", "family", "famous", "fan", "fancy", "fantasy", "far", "farm", "farmer", "fashion", "fast", "fat", "fate", "father", "fault", "favor", "favorite", "fear", "feast", "feather", "feature", "february", "federal", "fee", "feed", "feel", "feeling", "fellow", "female", "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "fierce", "fifteen", "fifth", "fifty", "fig", "fight", "figure", "file", "fill", "film", "filter", "final", "finance", "find", "fine", "finger", "finish", "fire", "firm", "first", "fish", "fit", "fitness", "five", "fix", "flag", "flame", "flash", "flat", "flavor", "flee", "fleet", "flesh", "flight", "flip", "float", "flock", "flood", "floor", "flour", "flow", "flower", "fluent", "fluffy", "fluid", "flute", "fly", "foam", "focus", "fog", "foil", "fold", "folk", "follow", "food", "fool", "foot", "football", "for", "force", "forest", "forever", "forget", "forgive", "fork", "form", "formal", "format", "fortune", "forty", "forum", "forward", "fossil", "foster", "found", "fountain", "four", "fox", "fragile", "frame", "free", "freedom", "freeze", "fresh", "friday", "fridge", "friend", "friendly", "fright", "frog", "from", "front", "frost", "frown", "frozen", "fruit", "fuel", "full", "fun", "function", "fund", "funny", "fur", "furnace", "future", "gadget", "gain", "galaxy", "gallery", "gallon", "gamble", "game", "gap", "garage", "garden", "garlic", "garment", "gas", "gasp", "gate", "gather", "gauge", "gaze", "gear", "gem", "general", "genius", "genre", "gentle", "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad", "glance", "glare", "glass", "glide", "glimpse", "glitter", "global", "globe", "gloom", "glory", "glove", "glow", "glue", "goal", "goat", "gold", "golden", "golf", "good", "goose", "gorgeous", "gospel", "gossip", "govern", "grace", "grade", "grain", "grand", "grant", "grape", "graph", "grasp", "grass", "grateful", "gravity", "gray", "great", "green", "greet", "grief", "grill", "grim", "grin", "grind", "grip", "grocery", "ground", "group", "grove", "grow", "growth", "guard", "guess", "guest", "guide", "guilt", "guitar", "gulf", "gym", "habit", "hair", "half", "hall", "hammer", "hamster", "hand", "handle", "hang", "happen", "happy", "harbor", "hard", "harmony", "harvest", "hat", "hatch", "hate", "have", "hawk", "hazard", "head", "heal", "health", "healthy", "hear", "heart", "heat", "heaven", "heavy", "hedge", "heel", "height", "hello", "helmet", "help", "helpful", "hen", "herb", "here", "hero", "heroic", "hidden", "hide", "high", "highway", "hike", "hill", "hint", "hints", "hip", "hire", "history", "hit", "hive", "hobby", "hockey", "hold", "hole", "holiday", "hollow", "holy", "home", "honest", "honey", "honor", "hood", "hook", "hop", "hope", "horizon", "horn", "horror", "horse", "hospital", "host", "hot", "hotel", "hour", "house", "hover", "how", "huge", "human", "humble", "humor", "hundred", "hunger", "hungry", "hunt", "hunter", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon", "idea", "ideal", "identify", "idle", "ignore", "ill", "image", "imagine", "immense", "impact", "import", "improve", "impulse", "inch", "include", "income", "increase", "indeed", "index", "indicate", "indoor", "industry", "infant", "infinite", "inform", "initial", "ink", "inland", "inner", "innocent", "input", "inquiry", "insect", "inside", "insight", "inspire", "install", "instant", "instead", "instinct", "intact", "intend", "intense", "interest", "internet", "into", "invent", "invest", "invite", "involve", "iron", "ironic", "island", "isolate", "issue", "item", "ivory", "jacket", "jade", "jaguar", "jam", "january", "jar", "jasmine", "jaw", "jazz", "jealous", "jeans", "jelly", "jet", "jewel", "job", "join", "joint", "joke", "jolly", "journal", "journey", "joy", "joyful", "judge", "juice", "juicy", "july", "jump", "june", "jungle", "junior", "junk", "jury", "just", "justice", "kangaroo", "keen", "keep", "kettle", "key", "keyboard", "kick", "kid", "kind", "kindness", "king", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knight", "knit", "knock", "knot", "know", "knowledge", "koala", "label", "labor", "lace", "lack", "ladder", "lady", "lagoon", "lake", "lamb", "lamp", "land", "language", "lantern", "lap", "laptop", "large", "laser", "last", "late", "later", "laugh", "laughter", "launch", "lava", "lavender", "law", "lawn", "lawyer", "layer", "lazy", "lead", "leader", "leaf", "league", "lean", "leap", "learn", "lease", "least", "leather", "leave", "lecture", "left", "leg", "legacy", "legal", "legend", "leisure", "lemon", "lend", "length", "lens", "leopard", "less", "lesson", "let", "letter", "level", "liberty", "library", "license", "lid", "life", "lift", "light", "lightning", "like", "likely", "lily", "limb", "limit", "limp", "line", "linen", "link", "lion", "lip", "liquid", "list", "listen", "little", "live", "lively", "liver", "lizard", "load", "loaf", "loan", "lobby", "lobster", "local", "lock", "lodge", "loft", "log", "logic", "lonely", "long", "look", "loop", "loose", "lord", "lose", "loss", "lot", "lotion", "lotus", "loud", "lounge", "love", "lovely", "lover", "low", "loyal", "loyalty", "luck", "lucky", "luggage", "lumber", "lunar", "lunch", "lung", "luxury", "lyric", "machine", "mad", "magazine", "magic", "magnet", "maid", "mail", "main", "major", "make", "maker", "mammal", "man", "manage", "mango", "mansion", "manual", "many", "map", "maple", "marble", "march", "margin", "marine", "mark", "market", "marriage", "marry", "marsh", "marvel", "mask", "mass", "master", "match", "mate", "material", "math", "matrix", "matter", "maximum", "may", "maybe", "mayor", "meadow", "meal", "mean", "meaning", "measure", "meat", "mechanic", "medal", "media", "medical", "medicine", "medium", "meet", "melody", "melon", "melt", "member", "memory", "mend", "mental", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message", "metal", "meteor", "method", "metro", "middle", "midnight", "might", "mighty", "mild", "mile", "milk", "mill", "million", "mind", "mine", "mineral", "minimal", "minimum", "minor", "mint", "minute", "miracle", "mirror", "mirth", "miss", "mission", "mist", "mistake", "mix", "mixture", "mobile", "mode", "model", "modern", "modest", "modify", "moist", "moment", "monday", "money", "monitor", "monkey", "monster", "month", "monument", "mood", "moon", "moonlight", "moral", "more", "morning", "mortal", "mosaic", "moss", "most", "moth", "mother", "motion", "motive", "motor", "mount", "mountain", "mouse", "mouth", "move", "movie", "much", "mud", "muffin", "mug", "multiply", "muscle", "museum", "mushroom", "music", "musical", "must", "mustard", "mutual", "mystery", "myth", "nail", "name", "napkin", "narrow", "nation", "native", "natural", "nature", "navy", "near", "nearly", "neat", "neck", "need", "needle", "negative", "neighbor", "neither", "neon", "nephew", "nerve", "nervous", "nest", "net", "network", "neutral", "never", "new", "news", "next", "nice", "nickel", "night", "nine", "noble", "nobody", "nod", "noise", "none", "noodle", "noon", "normal", "north", "nose", "not", "note", "nothing", "notice", "novel", "november", "now", "nuclear", "number", "nurse", "nut", "oak", "oar", "oasis", "oat", "obey", "object", "observe", "obtain", "obvious", "occasion", "ocean", "october", "odd", "off", "offer", "office", "often", "oil", "okay", "old", "olive", "olympic", "omega", "omelet", "once", "one", "onion", "online", "only", "onto", "onyx", "opal", "open", "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "orchid", "order", "ordinary", "organ", "organic", "origin", "other", "otter", "ought", "ounce", "our", "out", "outdoor", "outer", "outline", "output", "outside", "oval", "oven", "over", "overall", "owl", "own", "owner", "oxygen", "oyster", "ozone", "pace", "pack", "package", "packet", "pad", "paddle", "page", "pain", "paint", "painter", "pair", "palace", "pale", "palm", "pan", "panda", "panel", "panic", "panther", "paper", "parade", "paradise", "parcel", "parent", "park", "parrot", "part", "partner", "party", "pass", "passage", "passion", "passport", "past", "pasta", "paste", "patch", "path", "patience", "patient", "patrol", "pattern", "pause", "pave", "pay", "peace", "peach", "peak", "peanut", "pear", "pearl", "pebble", "pecan", "pedal", "peek", "peel", "pelican", "pen", "penalty", "pencil", "penguin", "penny", "people", "pepper", "percent", "perfect", "perform", "perfume", "perhaps", "period", "permit", "person", "pet", "petal", "phantom", "phase", "phoenix", "phone", "photo", "phrase", "physical", "piano", "pick", "picnic", "picture", "pie", "piece", "pier", "pig", "pigeon", "pile", "pill", "pillar", "pillow", "pilot", "pin", "pine", "pink", "pioneer", "pipe", "pirate", "pitch", "pizza", "place", "plain", "plan", "plane", "planet", "plant", "plastic", "plate", "platform", "platinum", "play", "player", "plaza", "please", "pleasure", "pledge", "plenty", "plot", "plow", "plug", "plum", "plunge", "plural", "plus", "plush", "pocket", "poem", "poet", "poetry", "point", "poise", "poison", "polar", "pole", "police", "policy", "polish", "polite", "pond", "pony", "pool", "poor", "pop", "popcorn", "popular", "porch", "port", "portal", "portion", "portrait", "pose", "position", "positive", "possess", "possible", "post", "potato", "pottery", "pouch", "pound", "pour", "powder", "power", "powerful", "practice", "praise", "pray", "prayer", "precious", "precise", "predict", "prefer", "prepare", "present", "preserve", "press", "pressure", "pretty", "prevent", "price", "pride", "primary", "prime", "prince", "princess", "print", "prior", "prism", "prison", "private", "prize", "probable", "problem", "process", "produce", "product", "profile", "profit", "program", "progress", "project", "promise", "promote", "prompt", "proof", "proper", "protect", "proud", "prove", "provide", "public", "pudding", "puddle", "pull", "pulse", "pump", "pumpkin", "punch", "pupil", "puppy", "purchase", "pure", "purple", "purpose", "purse", "push", "put", "puzzle", "pyramid", "quality", "quantum", "quarter", "quartz", "queen", "quest", "question", "quick", "quiet", "quilt", "quit", "quite", "quiz", "quote", "rabbit", "race", "rack", "radar", "radiant", "radio", "raft", "rage", "rail", "rain", "rainbow", "raise", "rally", "ram", "ranch", "random", "range", "rank", "rapid", "rare", "rate", "rather", "ratio", "raven", "raw", "ray", "reach", "react", "read", "reader", "ready", "real", "reality", "realize", "realm", "reason", "rebel", "rebuild", "recall", "receive", "recent", "recipe", "record", "recover", "red", "reduce", "reef", "reflect", "reform", "refresh", "refuge", "refuse", "regard", "region", "regret", "regular", "reign", "reject", "relate", "relax", "release", "relief", "rely", "remain", "remark", "remedy", "remember", "remind", "remote", "remove", "render", "renew", "rent", "repair", "repeat", "replace", "reply", "report", "rescue", "research", "reserve", "resist", "resolve", "resort", "resource", "respect", "respond", "rest", "restore", "result", "retire", "retreat", "return", "reveal", "review", "reward", "rhythm", "ribbon", "rice", "rich", "riddle", "ride", "rider", "ridge", "right", "rigid", "ring", "riot", "ripe", "ripple", "rise", "risk", "ritual", "rival", "river", "road", "roam", "roar", "roast", "rob", "robin", "robot", "rock", "rocket", "rod", "role", "roll", "romance", "roof", "room", "root", "rope", "rose", "rotate", "rough", "round", "route", "routine", "row", "royal", "rub", "rubber", "ruby", "rude", "rug", "ruin", "rule", "ruler", "rumble", "rumor", "run", "runner", "rural", "rush", "rust", "rustic", "sacred", "sad", "saddle", "safari", "safe", "safety", "sage", "sail", "sailor", "saint", "salad", "salary", "sale", "salmon", "salon", "salt", "salty", "salute", "same", "sample", "sand", "sandal", "sandwich", "sapphire", "saturn", "sauce", "sausage", "save", "scale", "scan", "scarce", "scarf", "scarlet", "scatter", "scene", "scent", "schedule", "scheme", "scholar", "school", "science", "scissors", "scooter", "scope", "score", "scout", "scrap", "scratch", "scream", "screen", "script", "scroll", "scrub", "sculpt", "sea", "seal", "search", "season", "seat", "second", "secret", "section", "secure", "see", "seed", "seek", "seem", "segment", "select", "self", "sell", "send", "senior", "sense", "sentence", "separate", "september", "serene", "series", "serious", "serve", "service", "session", "set", "settle", "seven", "several", "severe", "sew", "shade", "shadow", "shake", "shallow", "shame", "shape", "share", "shark", "sharp", "shave", "she", "shed", "sheep", "sheet", "shelf", "shell", "shelter", "shield", "shift", "shine", "shiny", "ship", "shirt", "shock", "shoe", "shoot", "shop", "shore", "short", "shot", "should", "shoulder", "shout", "show", "shower", "shrimp", "shrug", "shut", "shy", "sibling", "sick", "side", "sigh", "sight", "sign", "signal", "silence", "silent", "silk", "silly", "silver", "similar", "simple", "since", "sincere", "sing", "singer", "single", "sink", "sip", "sir", "siren", "sister", "sit", "site", "six", "size", "skate", "sketch", "ski", "skill", "skin", "skip", "skirt", "skull", "sky", "slab", "slam", "sleep", "sleepy", "sleeve", "slice", "slide", "slight", "slim", "slip", "slope", "slot", "slow", "small", "smart", "smash", "smell", "smile", "smoke", "smooth", "snack", "snail", "snake", "snap", "snatch", "sneak", "snow", "snowy", "snug", "soak", "soap", "soar", "soccer", "social", "sock", "soda", "sofa", "soft", "soil", "solar", "soldier", "solid", "solo", "solution", "solve", "some", "someone", "son", "song", "soon", "soothe", "sorry", "sort", "soul", "sound", "soup", "sour", "source", "south", "sovereign", "space", "spare", "spark", "sparkle", "sparrow", "speak", "speaker", "special", "species", "specific", "speech", "speed", "spell", "spend", "sphere", "spice", "spicy", "spider", "spike", "spill", "spin", "spine", "spiral", "spirit", "splash", "split", "spoil", "sponge", "sponsor", "spoon", "sport", "spot", "spray", "spread", "spring", "sprint", "sprout", "square", "squeeze", "squirrel", "stable", "stadium", "staff", "stage", "stain", "stair", "stake", "stale", "stamp", "stand", "standard", "star", "stare", "starlight", "start", "state", "station", "statue", "status", "stay", "steady", "steak", "steal", "steam", "steel", "steep", "steer", "stem", "step", "stereo", "stern", "stick", "sticky", "stiff", "still", "sting", "stir", "stitch", "stock", "stomach", "stone", "stool", "stop", "store", "storm", "stormy", "story", "stove", "straight", "strain", "strand", "strange", "stranger", "strap", "strategy", "straw", "strawberry", "stream", "street", "strength", "stress", "stretch", "strict", "stride", "strike", "string", "strip", "stripe", "strive", "stroke", "stroll", "strong", "structure", "struggle", "student", "studio", "study", "stuff", "stumble", "style", "subject", "submit", "subtle", "suburb", "succeed", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "summit", "sun", "sunday", "sunflower", "sunlight", "sunny", "sunrise", "sunset", "sunshine", "super", "superb", "supply", "support", "suppose", "supreme", "sure", "surface", "surge", "surprise", "surround", "survey", "survive", "suspect", "sustain", "swallow", "swamp", "swan", "swarm", "sway", "swear", "sweat", "sweater", "sweep", "sweet", "swell", "swift", "swim", "swing", "switch", "sword", "symbol", "sympathy", "symphony", "symptom", "syrup", "system", "table", "tablet", "tackle", "taco", "tag", "tail", "tailor", "take", "tale", "talent", "talk", "tall", "tame", "tan", "tangle", "tank", "tap", "tape", "target", "task", "taste", "tasty", "tattoo", "tax", "taxi", "tea", "teach", "teacher", "team", "teapot", "tear", "tease", "tech", "teddy", "teen", "teeth", "telescope", "tell", "temper", "temple", "tempo", "ten", "tend", "tender", "tennis", "tent", "term", "terrace", "terrain", "test", "text", "texture", "thank", "thankful", "that", "thaw", "theater", "theme", "then", "theory", "therapy", "there", "thermal", "these", "they", "thick", "thief", "thin", "thing", "think", "third", "thirst", "thirsty", "thirty", "this", "thorn", "those", "though", "thought", "thousand", "thread", "threat", "three", "thrill", "thrive", "throat", "throne", "through", "throw", "thumb", "thunder", "thursday", "ticket", "tide", "tidy", "tie", "tiger", "tight", "tile", "tilt", "timber", "time", "timid", "tin", "tiny", "tip", "tire", "tired", "tissue", "titan", "title", "toast", "today", "toddler", "toe", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue", "tonight", "tool", "tooth", "top", "topaz", "topic", "torch", "tornado", "torpedo", "tortoise", "toss", "total", "touch", "tough", "tour", "toward", "towel", "tower", "town", "toy", "trace", "track", "trade", "tradition", "traffic", "tragic", "trail", "train", "trait", "transfer", "transform", "transit", "translate", "trap", "trash", "travel", "tray", "treasure", "treat", "treaty", "tree", "trek", "tremble", "trend", "trial", "triangle", "tribe", "trick", "trigger", "trim", "trio", "trip", "triple", "triumph", "trivial", "trophy", "tropical", "trouble", "truck", "true", "truly", "trumpet", "trunk", "trust", "truth", "try", "tube", "tuesday", "tuft", "tug", "tulip", "tumble", "tuna", "tune", "tunnel", "turkey", "turn", "turtle", "tutor", "twelve", "twenty", "twice", "twilight", "twin", "twinkle", "twist", "two", "type", "typical", "umbrella", "umpire", "unable", "uncle", "under", "undergo", "understand", "unfair", "unfold", "unicorn", "uniform", "union", "unique", "unit", "unite", "unity", "universe", "unknown", "unless", "unlike", "unlock", "until", "unusual", "up", "update", "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge", "urgent", "usage", "use", "useful", "usual", "utility", "utter", "vacant", "vacation", "vacuum", "vague", "valid", "valley", "valuable", "value", "valve", "van", "vanilla", "vanish", "vapor", "variety", "various", "vase", "vast", "vault", "vector", "vegetable", "vehicle", "veil", "vein", "velvet", "vendor", "venture", "venue", "venus", "verb", "verdict", "verify", "verse", "version", "versus", "vertical", "very", "vessel", "vest", "veteran", "vibrant", "vibrate", "vice", "victory", "video", "view", "vigil", "vigor", "villa", "village", "vine", "vintage", "violin", "virtual", "virtue", "virus", "visible", "vision", "visit", "visitor", "visual", "vital", "vitamin", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "vowel", "voyage", "waffle", "wage", "wagon", "waist", "wait", "wake", "walk", "wall", "wallet", "walnut", "wander", "want", "warm", "warmth", "warn", "warrior", "wash", "wasp", "waste", "watch", "water", "waterfall", "wave", "wax", "way", "wealth", "weapon", "wear", "weather", "weave", "web", "wedding", "wednesday", "weed", "week", "weekend", "weigh", "weight", "weird", "welcome", "well", "west", "wet", "whale", "what", "wheat", "wheel", "when", "where", "which", "while", "whip", "whisper", "whistle", "white", "who", "whole", "whom", "whose", "why", "wide", "widow", "width", "wife", "wild", "wildlife", "will", "willing", "willow", "win", "wind", "window", "windy", "wine", "wing", "wink", "winner", "winter", "wipe", "wire", "wisdom", "wise", "wish", "wit", "witch", "with", "within", "without", "witness", "wizard", "wolf", "woman", "wonder", "wonderful", "wood", "wooden", "wool", "word", "work", "worker", "workshop", "world", "worry", "worship", "worth", "worthy", "would", "wound", "wrap", "wreath", "wreck", "wrestle", "wrist", "write", "writer", "wrong", "yard", "yarn", "yawn", "year", "yellow", "yes", "yesterday", "yet", "yield", "yoga", "yogurt", "young", "your", "youth", "zeal", "zebra", "zenith", "zero", "zest", "zinc", "zone", "zoo"];

// worker/src/dictionary.js
var LOCAL_WORDS = new Set(local_words_default);
var SOURCE_PRIORITY = [
  "dictionary-api",
  "wiktionary-api",
  "datamuse",
  "simple-wiktionary",
  "wikipedia",
  "wikidata"
];
var VALID_WIKTIONARY_POS = /* @__PURE__ */ new Set([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "article",
  "numeral",
  "interjection"
]);
var MAX_JSON_CHARS = 2e5;
function stripHtmlTags(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
__name(stripHtmlTags, "stripHtmlTags");
function miss(definitive) {
  return { found: false, definitiveMiss: definitive, definition: null };
}
__name(miss, "miss");
function hit(definition) {
  const clean = definition ? stripHtmlTags(String(definition)).slice(0, 180) : null;
  return { found: true, definitiveMiss: false, definition: clean || null };
}
__name(hit, "hit");
async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WorldWordGame/1.0 (https://worldwordgame.com; free dictionary lookup)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(4e3)
    });
    const declared = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > MAX_JSON_CHARS) {
      await response.body?.cancel();
      return { status: response.status, data: null };
    }
    const text = await response.text();
    if (text.length > MAX_JSON_CHARS) {
      return { status: response.status, data: null };
    }
    try {
      return { status: response.status, data: JSON.parse(text) };
    } catch (_err) {
      return { status: response.status, data: null };
    }
  } catch (_err) {
    return { status: 0, data: null };
  }
}
__name(fetchJson, "fetchJson");
async function checkFreeDictionaryApi(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const { status, data } = await fetchJson(url);
  if (status === 200 && Array.isArray(data) && data.length > 0) {
    return hit(data[0]?.meanings?.[0]?.definitions?.[0]?.definition);
  }
  if (status === 404) return miss(true);
  return miss(false);
}
__name(checkFreeDictionaryApi, "checkFreeDictionaryApi");
async function checkWiktionaryApi(word) {
  const restUrl = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
  const rest = await fetchJson(restUrl);
  if (rest.status === 200 && rest.data && typeof rest.data === "object") {
    const enEntries = Array.isArray(rest.data.en) ? rest.data.en : [];
    const validEntry = enEntries.find((entry) => {
      const pos = String(entry?.partOfSpeech || "").toLowerCase();
      return VALID_WIKTIONARY_POS.has(pos) && Array.isArray(entry?.definitions) && entry.definitions.length > 0;
    });
    if (validEntry) return hit(validEntry.definitions[0]?.definition);
    return miss(true);
  }
  if (rest.status === 404) return miss(true);
  const queryUrl = `https://en.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&format=json&redirects=1`;
  const { status, data } = await fetchJson(queryUrl);
  if (status === 200 && data?.query?.pages) {
    const page = Object.values(data.query.pages)[0];
    const exists = Boolean(page) && page.missing === void 0 && page.pageid > 0;
    const title = String(page?.title || "").toLowerCase();
    if (exists && title === word) return hit(null);
    return miss(true);
  }
  return miss(false);
}
__name(checkWiktionaryApi, "checkWiktionaryApi");
async function checkSimpleWiktionary(word) {
  const url = `https://simple.wiktionary.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(word)}&prop=extracts&exintro=1&explaintext=1&exchars=180`;
  const { status, data } = await fetchJson(url);
  if (status !== 200 || !data?.query?.pages) return miss(false);
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing !== void 0 || page.pageid < 0) return miss(true);
  if (String(page.title || "").toLowerCase() !== word) return miss(true);
  return hit(page.extract);
}
__name(checkSimpleWiktionary, "checkSimpleWiktionary");
async function checkDatamuse(word) {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=5`;
  const { status, data } = await fetchJson(url);
  if (status !== 200 || !Array.isArray(data)) return miss(false);
  const row = data.find((item) => item?.word === word);
  if (!row) return miss(true);
  const rawDef = Array.isArray(row.defs) ? row.defs[0] : "";
  const definition = String(rawDef || "").split("	").slice(1).join(" ").trim();
  return hit(definition);
}
__name(checkDatamuse, "checkDatamuse");
async function checkWikipedia(word) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
  const { status, data } = await fetchJson(url);
  if (status === 404) return miss(true);
  if (status !== 200 || !data || typeof data !== "object") return miss(false);
  const title = String(data.title || "").trim().toLowerCase();
  if (title !== word) return miss(true);
  return hit(data.extract || data.description);
}
__name(checkWikipedia, "checkWikipedia");
async function checkWikidata(word) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=8&search=${encodeURIComponent(word)}`;
  const { status, data } = await fetchJson(url);
  if (status !== 200 || !data || !Array.isArray(data.search)) return miss(false);
  const row = data.search.find((item) => String(item?.label || "").trim().toLowerCase() === word);
  if (!row) return miss(true);
  return hit(row.description);
}
__name(checkWikidata, "checkWikidata");
async function checkRemoteReferences(word) {
  const checks = [
    ["dictionary-api", checkFreeDictionaryApi],
    ["wiktionary-api", checkWiktionaryApi],
    ["simple-wiktionary", checkSimpleWiktionary],
    ["datamuse", checkDatamuse],
    ["wikipedia", checkWikipedia],
    ["wikidata", checkWikidata]
  ];
  const settled = await Promise.all(
    checks.map(async ([id, fn]) => {
      try {
        const result = await fn(word);
        return { id, ...result };
      } catch (_err) {
        return { id, found: false, definitiveMiss: false, definition: null };
      }
    })
  );
  const best = SOURCE_PRIORITY.map((id) => settled.find((row) => row.id === id && row.found)).find(Boolean);
  const coreIds = /* @__PURE__ */ new Set(["dictionary-api", "wiktionary-api", "datamuse"]);
  const coreMisses = settled.filter((row) => coreIds.has(row.id) && row.definitiveMiss).length;
  const anyFound = settled.some((row) => row.found);
  return {
    found: Boolean(best),
    source: best ? best.id : null,
    definition: best ? best.definition : null,
    allDefinitiveMiss: !anyFound && coreMisses >= 2
  };
}
__name(checkRemoteReferences, "checkRemoteReferences");
async function verifyWordExists(word, repo) {
  const normalized = String(word).trim().toLowerCase();
  if (failsPatternFilter(normalized)) {
    return { exists: false, source: "pattern-filter", definition: null };
  }
  if (LOCAL_WORDS.has(normalized)) {
    return { exists: true, source: "local-wordlist", definition: null };
  }
  const cached = await repo.getCachedWord(normalized);
  if (cached) {
    return {
      exists: cached.exists,
      source: `cache:${cached.source}`,
      definition: cached.definition
    };
  }
  const remote = await checkRemoteReferences(normalized);
  if (remote.found) {
    await repo.setCachedWord(normalized, true, remote.source, remote.definition);
    return { exists: true, source: remote.source, definition: remote.definition };
  }
  if (remote.allDefinitiveMiss) {
    await repo.setCachedWord(normalized, false, "reference-miss", null);
    return { exists: false, source: "reference-miss", definition: null };
  }
  return { exists: false, source: "unverified", definition: null };
}
__name(verifyWordExists, "verifyWordExists");


// worker/src/moderation.js (discriminatory terms only; swears allowed)
var ALLOWLIST_EXCEPTIONS = ["niger","nigeria","nigerien","nigerian"];
var DISCRIMINATORY_TERMS = ["nigger","niggers","nigga","niggas","negro","negros","negroes","coon","coons","darkie","darkies","jigaboo","jiggaboo","spic","spick","spics","wetback","wetbacks","beaner","beaners","chink","chinks","gook","gooks","jap","japs","paki","pakis","kike","kikes","heeb","heebs","raghead","ragheads","towelhead","towelheads","sandnigger","sandniggers","cameljockey","hajji","hadji","honky","honkie","honkies","whitey","redskin","redskins","injun","injuns","squaw","squaws","gypsy","gypsies","gyppo","gypo","pikey","pikies","wop","wops","dago","dagos","polack","polacks","kraut","krauts","chinaman","chinamen","christkiller","christkillers","fag","fags","faggot","faggots","fagot","fagots","dyke","dykes","tranny","trannies","shemale","shemales","ladyboy","ladyboys","retard","retards","retarded","spaz","spazz","spastic","mongoloid","mongoloids","cripple","cripples","killall","whitepower","hitlerdidnothingwrong"];
var allowSet = new Set(ALLOWLIST_EXCEPTIONS);
var blockSet = new Set(DISCRIMINATORY_TERMS);
var LEEET_MAP = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
function collapseRepeats(value) {
  return value.replace(/(.)\1{2,}/g, "$1$1");
}
__name(collapseRepeats, "collapseRepeats");
function normalizeModerationWord(input) {
  const raw = String(input || "").toLowerCase();
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (LEEET_MAP[ch]) out += LEEET_MAP[ch];
    else if (ch >= "a" && ch <= "z") out += ch;
  }
  return collapseRepeats(out);
}
__name(normalizeModerationWord, "normalizeModerationWord");
function checkDiscriminatoryWord(input) {
  const normalized = normalizeModerationWord(input);
  if (!normalized) {
    return { ok: false, code: "EMPTY_WORD", message: "Please enter a word first!" };
  }
  if (allowSet.has(normalized)) {
    return { ok: true, normalized, allowedByException: true };
  }
  if (blockSet.has(normalized)) {
    return {
      ok: false,
      code: "DISCRIMINATORY_WORD",
      message: "That word isn't allowed here. Please try a different word.",
      normalized
    };
  }
  return { ok: true, normalized };
}
__name(checkDiscriminatoryWord, "checkDiscriminatoryWord");
function shouldHideDiscriminatory(input) {
  const result = checkDiscriminatoryWord(input);
  return result.ok === false && result.code === "DISCRIMINATORY_WORD";
}
__name(shouldHideDiscriminatory, "shouldHideDiscriminatory");

// worker/src/index.js
function visitorFrom(request) {
  return request.headers.get("x-visitor-id") || request.headers.get("visitor-id") || null;
}
__name(visitorFrom, "visitorFrom");
async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return empty(204);
  const repo = createRepository(env.DB);
  const path = url.pathname;
  if (path === "/api/submit" && request.method === "POST") {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return json({ ok: false, error: parsed.error, detail: parsed.error, code: parsed.code }, 400);
    }
    const rawWord = parsed.body.word ?? parsed.body.phrase ?? parsed.body.text;
    const explicitType = parsed.body.type ?? parsed.body.mode;
    const validation = normalizeAndValidateEntry(rawWord, explicitType);
    if (!validation.ok) {
      return json(
        { ok: false, error: validation.error, detail: validation.error, code: validation.code },
        400
      );
    }
    const tokens = validation.type === "phrase" ? validation.words : [validation.word];
    for (const token of tokens) {
      const moderation = checkDiscriminatoryWord(token);
      if (!moderation.ok) {
        return json(
          { ok: false, error: moderation.message, detail: moderation.message, code: moderation.code },
          400
        );
      }
    }
    let dictCheck;
    if (validation.type === "phrase") {
      const sense = await languageToolSenseCheck(validation.word);
      if (!sense.ok) {
        return json(
          { ok: false, error: sense.error, detail: sense.error, code: sense.code },
          400
        );
      }
      dictCheck = await verifyPhraseExists(validation.words, repo);
      if (!dictCheck.exists) {
        const missing = String(dictCheck.missing || "word").toUpperCase();
        const notFoundMsg = `"${missing}" is not in the dictionary. Phrases need real English words!`;
        return json({ ok: false, error: notFoundMsg, detail: notFoundMsg, code: "WORD_NOT_FOUND" }, 400);
      }
    } else {
      dictCheck = await verifyWordExists(validation.word, repo);
      if (!dictCheck.exists) {
        const notFoundMsg = `"${validation.word.toUpperCase()}" is not in the dictionary. Try a real English word!`;
        return json({ ok: false, error: notFoundMsg, detail: notFoundMsg, code: "WORD_NOT_FOUND" }, 400);
      }
    }
    const visitorId = resolveVisitorId(request, parsed.body);
    const result = await repo.recordSubmission(validation.word, visitorId);
    const stats = await repo.getStats();
    return json({
      ok: true,
      ...result,
      type: validation.type || "word",
      dictionarySource: dictCheck.source,
      definition: dictCheck.definition || null,
      stats
    });
  }
  if (path === "/api/leaderboard" && request.method === "GET") {
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit === null ? 50 : Number(rawLimit);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(200, Math.floor(parsedLimit))) : 50;
    const headerVisitor = visitorFrom(request);
    const visitorId = headerVisitor && /^[a-zA-Z0-9_-]{1,128}$/.test(headerVisitor.trim()) ? headerVisitor.trim() : null;
    const data = await repo.getLeaderboard(limit, visitorId);
    const filtered = (data.leaderboard || []).filter((item) => !shouldHideDiscriminatory(item.word));
    const cleaned = filtered.map((item, index) => ({ ...item, rank: index + 1, medal: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "" }));
    const topWord = data.topWord && shouldHideDiscriminatory(data.topWord) ? "" : data.topWord;
    return json({ ok: true, ...data, leaderboard: cleaned, items: cleaned, topWord, top_word: topWord });
  }
  if (path === "/api/stats" && request.method === "GET") {
    const stats = await repo.getStats();
    if (stats.topWord && shouldHideDiscriminatory(stats.topWord)) {
      stats.topWord = "";
      stats.top_word = "";
      stats.topWordDisplay = "—";
      stats.topWordCount = 0;
      stats.top_word_count = 0;
    }
    return json({ ok: true, ...stats });
  }
  if (path === "/api/submit" || path === "/api/leaderboard" || path === "/api/stats") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  return json({ ok: false, error: "Not found." }, 404);
}
__name(handleApi, "handleApi");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(
          JSON.stringify({
            message: "api request failed",
            path: url.pathname,
            method: request.method,
            error: err instanceof Error ? err.message : "unknown"
          })
        );
        return json({ ok: false, error: "The request could not be completed." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map