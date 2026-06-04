import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeQuoteFromAnswers,
  validateQuoteSpec,
  buildQuoteSentence,
  fmtMoney,
  fmtRange,
} from "../src/quote.js";

test("roofing (formula mode) computes a tidy range", () => {
  const q = computeQuoteFromAnswers({ enabled: true, trade: "roofing" }, { squares: 20, steep: "standard" }, {});
  // 20*900+250=18250 -> 18000 ; 20*1200+250=24250 -> 25000
  assert.equal(q.low, 18000);
  assert.equal(q.high, 25000);
  assert.equal(q.unit, "job");
  assert.ok(q.disclaimer.includes("estimate only"));
  assert.ok(q.low < q.high);
});

test("roofing applies the steep multiplier", () => {
  const flat = computeQuoteFromAnswers({ enabled: true, trade: "roofing" }, { squares: 20, steep: "standard" }, {});
  const steep = computeQuoteFromAnswers({ enabled: true, trade: "roofing" }, { squares: 20, steep: "steep" }, {});
  assert.ok(steep.low > flat.low);
  assert.ok(steep.high > flat.high);
});

test("roofing honours per-business rate overrides", () => {
  const q = computeQuoteFromAnswers(
    { enabled: true, trade: "roofing", rates: { per_square_low: 500, per_square_high: 700, callout: 0, steep_mult: 1.3 } },
    { squares: 10, steep: "standard" },
    {},
  );
  // 10*500=5000 ; 10*700=7000
  assert.equal(q.low, 5000);
  assert.equal(q.high, 7000);
});

test("hvac (matrix mode) maps the triage code to a band", () => {
  const notWorking = computeQuoteFromAnswers({ enabled: true, trade: "hvac" }, { issue_code: "1" }, {});
  assert.equal(notWorking.low, 180);
  assert.equal(notWorking.high, 650);

  const newInstall = computeQuoteFromAnswers({ enabled: true, trade: "hvac" }, { issue_code: "4" }, {});
  assert.equal(newInstall.low, 4500);
  assert.equal(newInstall.high, 12000);

  const unknown = computeQuoteFromAnswers({ enabled: true, trade: "hvac" }, { issue_code: "Z" }, {});
  assert.equal(unknown.low, 150); // fallback band
  assert.equal(unknown.high, 600);
});

test("falls back to an avg-anchored band when no spec can compute", () => {
  const q = computeQuoteFromAnswers({ enabled: true, trade: "mystery-trade" }, {}, { avgJobValue: 1000 });
  assert.equal(q.low, 800);   // 1000 * 0.8
  assert.equal(q.high, 1250); // 1000 * 1.25
});

test("returns null when nothing to anchor to", () => {
  assert.equal(computeQuoteFromAnswers({ enabled: true, trade: "mystery" }, {}, {}), null);
});

test("validateQuoteSpec enforces the formula guard", () => {
  assert.equal(validateQuoteSpec({ enabled: true, trade: "roofing" }).ok, true);
  assert.equal(validateQuoteSpec({ enabled: true, trade: "hvac" }).ok, true);
  assert.equal(validateQuoteSpec({ enabled: false }).ok, true);

  const customOk = validateQuoteSpec({
    enabled: true, mode: "formula",
    inputs: [{ key: "x", type: "number" }], rates: { r: 2 },
    formulaLow: "x * r", formulaHigh: "x * r + 1",
  });
  assert.equal(customOk.ok, true);

  const malicious = validateQuoteSpec({
    enabled: true, mode: "formula",
    inputs: [{ key: "x", type: "number" }], rates: {},
    formulaLow: "eval(x)", formulaHigh: "x",
  });
  assert.equal(malicious.ok, false);

  assert.equal(validateQuoteSpec({ enabled: true, trade: "nope" }).ok, false);
});

test("money formatting reads like a tradesperson wrote it", () => {
  assert.equal(fmtMoney(16000), "$16k");
  assert.equal(fmtMoney(22000), "$22k");
  assert.equal(fmtMoney(7250), "$7.3k");
  assert.equal(fmtMoney(450), "$450");
  assert.equal(fmtRange({ low: 16000, high: 22000 }), "$16k–$22k");
  assert.ok(buildQuoteSentence({ low: 16000, high: 22000, disclaimer: "estimate only — confirmed on site" })
    .includes("$16k–$22k"));
});
