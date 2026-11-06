#!/usr/bin/env node
/**
 * Phrase sense + server validation smoke tests (no network for local layer).
 */
import assert from "node:assert/strict";
import {
  validatePhraseLocal,
  validateWordLocal,
  validateSubmission,
  detectMode,
} from "../server/phraseValidation.mjs";

function expectFail(result, code) {
  assert.equal(result.ok, false, `expected fail for ${code}`);
  if (code) assert.equal(result.code, code);
}

function expectOk(result) {
  assert.equal(result.ok, true, result.error || "expected ok");
}

// Word mode unchanged
expectOk(validateWordLocal("hello"));
expectFail(validateWordLocal("hello world"), "INVALID_CHARACTERS");
expectFail(validateWordLocal(""), "EMPTY_WORD");

// Phrase structure / sense heuristics
expectOk(validatePhraseLocal("hello world"));
expectOk(validatePhraseLocal("love and peace"));
expectFail(validatePhraseLocal("hello"), "INVALID_PHRASE_CHARS");
expectFail(validatePhraseLocal("the and of"), "NO_CONTENT_WORDS");
expectFail(validatePhraseLocal("hi hi hi"), "REPEATED_GIBBERISH");
expectFail(validatePhraseLocal("hello! world"), "INVALID_PHRASE_CHARS");

assert.equal(detectMode({ type: "phrase", word: "x" }), "phrase");
assert.equal(detectMode({ word: "hello world" }), "phrase");
assert.equal(detectMode({ word: "hello" }), "word");

expectOk(validateSubmission({ word: "peace", type: "word" }));
expectOk(validateSubmission({ word: "good morning", type: "phrase" }));
expectFail(
  validateSubmission({ word: "good morning", type: "word" }),
  "INVALID_CHARACTERS"
);

console.log("test-phrase-sense: ok");
