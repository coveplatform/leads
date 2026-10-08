import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOption, validateReply, parseReply, isUrgentAnswer, INDUSTRY_TEMPLATES } from "../src/flow-engine.js";

const plumbing = INDUSTRY_TEMPLATES.plumbing.steps[0];
const electrical = INDUSTRY_TEMPLATES.electrical.steps[0];
const hvac = INDUSTRY_TEMPLATES.hvac.steps[0];

const value = (step, text) => matchOption(step, text)?.value ?? null;

test("exact option value, any case and padding", () => {
  assert.equal(value(plumbing, "a"), "A");
  assert.equal(value(plumbing, " B "), "B");
  assert.equal(value(hvac, "3"), "3");
});

test("leading option value followed by punctuation or words", () => {
  assert.equal(value(plumbing, "A please"), "A");
  assert.equal(value(plumbing, "b - it's urgent"), "B");
  assert.equal(value(hvac, "1) yes"), "1");
  assert.equal(value(hvac, "2."), "2");
});

test("a word starting with an option letter is not that option", () => {
  // "ASAP" starts with A but is the synonym for B (same day)
  assert.equal(value(plumbing, "asap"), "B");
  assert.equal(value(plumbing, "boring"), null);
});

test("option label and label prefix", () => {
  assert.equal(value(plumbing, "Not urgent"), "C");
  assert.equal(value(plumbing, "not urgent at all"), "C");
  assert.equal(value(plumbing, "emerg"), "A");
  assert.equal(value(hvac, "not cooling"), "2");
});

test("label prefix shared by two options is ambiguous", () => {
  // "not" prefixes both "Not working at all" and "Not cooling/heating properly"
  assert.equal(value(hvac, "not"), null);
});

test("synonyms anywhere in the reply", () => {
  assert.equal(value(plumbing, "burst pipe in the kitchen"), "A");
  assert.equal(value(plumbing, "there's flooding everywhere"), "A");
  assert.equal(value(plumbing, "no rush mate"), "C");
  assert.equal(value(hvac, "it's making a rattling noise"), "3");
});

test("synonyms match whole words only", () => {
  // "gas" must not match inside "gasket"
  assert.equal(value(plumbing, "need a new gasket"), null);
});

test("longest synonym wins; equal-length matches on two options are ambiguous", () => {
  assert.equal(value(electrical, "no power"), "A");
  assert.equal(value(electrical, "no"), "B");
  assert.equal(value(electrical, "yes"), "A");
  // "leak" (A) vs "today" (B): different lengths, longest wins
  assert.equal(value(plumbing, "leak, need someone today"), "B");
  // "flood" (A, 5) vs "today" (B, 5): tie
  assert.equal(value(plumbing, "flood today"), null);
});

test("unrelated text matches nothing", () => {
  assert.equal(value(plumbing, "hello"), null);
  assert.equal(value(plumbing, ""), null);
  assert.equal(validateReply(plumbing, "what"), false);
});

test("parseReply stores the matched option's code and label", () => {
  assert.deepEqual(parseReply(plumbing, "burst pipe"), { urgency_code: "A", urgency_label: "Emergency — active leak" });
});

test("isUrgentAnswer follows the matched option", () => {
  assert.equal(isUrgentAnswer(plumbing, "water everywhere, burst"), true);
  assert.equal(isUrgentAnswer(plumbing, "C"), false);
  assert.equal(isUrgentAnswer(hvac, "weird smell"), true);
});

test("free text steps accept any non-empty reply", () => {
  const step = { key: "job", free_text: true };
  assert.equal(validateReply(step, "hot water's out"), true);
  assert.deepEqual(parseReply(step, " hot water's out "), { job_code: "free_text", job_label: "hot water's out" });
});
