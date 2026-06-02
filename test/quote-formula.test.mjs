import { test } from "node:test";
import assert from "node:assert/strict";
import { validFormula, evalFormula, compiles, SAFE_CHARS } from "../src/quote-formula.js";

const ROOFING_VARS = ["squares", "per_square_low", "per_square_high", "steep_mult", "callout"];

test("validFormula accepts a valid roofing formula", () => {
  assert.equal(validFormula("squares * per_square_low * steep_mult + callout", ROOFING_VARS).ok, true);
  assert.equal(validFormula("max(squares, 1) * per_square_high", ROOFING_VARS).ok, true);
});

test("validFormula rejects eval / code injection", () => {
  assert.equal(validFormula("eval(1)", []).ok, false);
  assert.equal(validFormula("process.exit(1)", []).ok, false);
  assert.equal(validFormula("(() => 1)()", []).ok, false); // banned '=>'
  assert.equal(validFormula("constructor", []).ok, false);
  assert.equal(validFormula("require('fs')", []).ok, false);
  assert.equal(validFormula("global", []).ok, false);
});

test("validFormula rejects non-whitelisted identifiers and bad structure", () => {
  assert.equal(validFormula("squares * x", ["squares"]).ok, false); // x not allowed
  assert.equal(validFormula("1 + )(", []).ok, false);               // unbalanced
  assert.equal(validFormula("", []).ok, false);                     // empty
});

test("SAFE_CHARS blocks obviously hostile characters", () => {
  assert.equal(SAFE_CHARS.test("1 + 2"), true);
  assert.equal(SAFE_CHARS.test("a[b]"), false);
  assert.equal(SAFE_CHARS.test("x; y"), false);
});

test("evalFormula computes arithmetic with precedence", () => {
  assert.equal(evalFormula("2 + 3 * 4", {}), 14);
  assert.equal(evalFormula("(2 + 3) * 4", {}), 20);
  assert.equal(evalFormula("-5 + 10", {}), 5);
  assert.equal(evalFormula("10 / 4", {}), 2.5);
});

test("evalFormula resolves variables and functions", () => {
  assert.equal(evalFormula("squares * 2", { squares: 21 }), 42);
  assert.equal(evalFormula("max(low, high)", { low: 3, high: 9 }), 9);
  assert.equal(evalFormula("min(low, high)", { low: 3, high: 9 }), 3);
  assert.equal(evalFormula("round(7.6)", {}), 8);
  assert.equal(
    evalFormula("squares * per_square_low * steep_mult + callout", {
      squares: 20, per_square_low: 350, steep_mult: 1, callout: 250,
    }),
    7250,
  );
});

test("evalFormula throws on injection or unknown vars", () => {
  assert.throws(() => evalFormula("eval(1)", {}));
  assert.throws(() => evalFormula("a + b", { a: 1 }));
  assert.throws(() => evalFormula("constructor", {}));
});

test("compiles smoke-tests a formula against allowed vars", () => {
  assert.equal(compiles("squares * per_square_low", ["squares", "per_square_low"]), true);
  assert.equal(compiles("squares * nope", ["squares"]), false);
});
