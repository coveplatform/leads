// Safe arithmetic for quote formulas — ported & hardened from Plot's
// build/llmBuild.ts (validFormula / SAFE_CHARS / BANNED / compiles).
//
// Quote formula strings can come from owner config or an AI-authored spec, so
// they are treated as untrusted. We never use eval / new Function. Instead a
// tiny recursive-descent evaluator runs the expression against an explicit
// numeric scope, supporting only + - * / ( ), unary minus, and a fixed set of
// math functions. validFormula() is a fast structural gate used before any
// formula is accepted.

// Characters a formula may contain at all (pre-tokenization).
export const SAFE_CHARS = /^[0-9A-Za-z_+\-*/(),.\s]+$/;

// Substrings that must never appear — defence in depth on top of the char
// whitelist and the evaluator's closed grammar.
export const BANNED = [
  "eval", "function", "=>", "require", "import", "process", "global",
  "constructor", "prototype", "window", "this", "await", "async",
  "while", "for", "return", "new ", "`", "[", "]", "{", "}",
  ";", "=", "&", "|", "!", "?", ":", "\\", '"', "'", "$", "#", "@",
];

const ALLOWED_FNS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: (x) => Math.round(x),
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
};

// ─── Tokenizer ───
function tokenize(formula) {
  const tokens = [];
  const re = /\s*([0-9]*\.?[0-9]+|[A-Za-z_][A-Za-z0-9_]*|[+\-*/(),])/y;
  let pos = 0;
  while (pos < formula.length) {
    re.lastIndex = pos;
    const m = re.exec(formula);
    if (!m || m.index !== pos) {
      throw new Error(`Unexpected character at ${pos}`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
    // consume trailing whitespace handled by \s* at next match start
    if (pos < formula.length && /\s/.test(formula[pos])) {
      while (pos < formula.length && /\s/.test(formula[pos])) pos++;
    }
  }
  return tokens;
}

// ─── Recursive-descent parser/evaluator ───
// expr   := term (('+'|'-') term)*
// term   := factor (('*'|'/') factor)*
// factor := '-' factor | primary
// primary:= number | ident ['(' args ')'] | '(' expr ')'
class Evaluator {
  constructor(tokens, scope) {
    this.t = tokens;
    this.i = 0;
    this.scope = scope;
  }
  peek() { return this.t[this.i]; }
  next() { return this.t[this.i++]; }
  expect(tok) {
    if (this.next() !== tok) throw new Error(`Expected '${tok}'`);
  }
  parse() {
    const v = this.expr();
    if (this.i !== this.t.length) throw new Error("Trailing tokens");
    return v;
  }
  expr() {
    let v = this.term();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.next();
      const r = this.term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  term() {
    let v = this.factor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.next();
      const r = this.factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  factor() {
    if (this.peek() === "-") { this.next(); return -this.factor(); }
    if (this.peek() === "+") { this.next(); return this.factor(); }
    return this.primary();
  }
  primary() {
    const tok = this.peek();
    if (tok === "(") {
      this.next();
      const v = this.expr();
      this.expect(")");
      return v;
    }
    if (/^[0-9.]/.test(tok)) { this.next(); return Number(tok); }
    if (/^[A-Za-z_]/.test(tok)) {
      this.next();
      if (this.peek() === "(") {
        // function call
        this.next();
        const args = [];
        if (this.peek() !== ")") {
          args.push(this.expr());
          while (this.peek() === ",") { this.next(); args.push(this.expr()); }
        }
        this.expect(")");
        const fn = ALLOWED_FNS[tok];
        if (!fn) throw new Error(`Unknown function '${tok}'`);
        return fn(...args);
      }
      // variable
      if (!Object.prototype.hasOwnProperty.call(this.scope, tok)) {
        throw new Error(`Unknown variable '${tok}'`);
      }
      const val = Number(this.scope[tok]);
      if (!Number.isFinite(val)) throw new Error(`Variable '${tok}' is not a finite number`);
      return val;
    }
    throw new Error(`Unexpected token '${tok}'`);
  }
}

// Structural validation. Returns { ok, reason }. allowedVars is the set of
// variable names the scope will provide; anything else (besides allowed
// functions and numbers/operators) is rejected.
export function validFormula(formula, allowedVars = []) {
  const f = String(formula || "").trim();
  if (!f) return { ok: false, reason: "empty" };
  if (f.length > 200) return { ok: false, reason: "too long" };
  if (!SAFE_CHARS.test(f)) return { ok: false, reason: "illegal character" };

  const lower = f.toLowerCase();
  for (const b of BANNED) {
    if (lower.includes(b)) return { ok: false, reason: `banned token: ${b.trim()}` };
  }

  // Balanced parentheses.
  let depth = 0;
  for (const ch of f) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) return { ok: false, reason: "unbalanced ()" }; }
  }
  if (depth !== 0) return { ok: false, reason: "unbalanced ()" };

  // Every identifier must be an allowed variable or function.
  const allowed = new Set([...allowedVars, ...Object.keys(ALLOWED_FNS)]);
  const idents = f.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const id of idents) {
    if (!allowed.has(id)) return { ok: false, reason: `unknown identifier: ${id}` };
  }
  return { ok: true };
}

// Evaluate a formula against a numeric scope. Throws on any malformed input.
export function evalFormula(formula, scope = {}) {
  const f = String(formula || "").trim();
  const check = validFormula(f, Object.keys(scope));
  if (!check.ok) throw new Error(`Invalid formula: ${check.reason}`);
  const result = new Evaluator(tokenize(f), scope).parse();
  if (!Number.isFinite(result)) throw new Error("Formula produced a non-finite result");
  return result;
}

// True if the formula both validates and runs cleanly against a sample scope
// (all allowed vars set to 1). Mirrors Plot's compiles() smoke-test.
export function compiles(formula, allowedVars = []) {
  if (!validFormula(formula, allowedVars).ok) return false;
  const sample = {};
  for (const v of allowedVars) sample[v] = 1;
  try {
    return Number.isFinite(new Evaluator(tokenize(String(formula).trim()), sample).parse());
  } catch {
    return false;
  }
}
