// HTTP integration test for the magic-demo backend (capture → quote → book).
// Runs against the real Express app with NO database: /api/quote/simulate
// swallows the rate-limit DB call, so the transcript renders regardless.
process.env.VERCEL = "1"; // prevent server.js from auto-listening on import
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://u:p@localhost/db";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const app = (await import("../src/server.js")).default;
let server, base;

before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { if (server) server.close(); });

async function simulate(body) {
  const r = await fetch(`${base}/api/quote/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

test("GET /health responds ok", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test("roofing demo renders capture → quote → book with a sane $range", async () => {
  const { status, data } = await simulate({
    businessName: "Apex Roofing", trade: "roofing", avgJobValue: 0,
    details: { squares: 18, steep: "steep" },
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);

  // capture, caller need, quote+booking, caller pick, confirm
  assert.ok(data.messages.length >= 4, "expected a full transcript");
  assert.equal(data.messages[0].from, "cove");
  assert.match(data.messages[0].text, /sorry we missed your call/i);

  const quoteMsg = data.messages.find((m) => /\$\d/.test(m.text));
  assert.ok(quoteMsg, "a message should carry the $ quote");
  assert.match(data.quote.range, /\$[\d.]+k?–\$[\d.]+k?/);
  assert.ok(data.slots.length > 0, "slots should be generated");

  const last = data.messages[data.messages.length - 1];
  assert.match(last.text, /Booked ✅/);
  assert.match(data.ownerAlert, /🔥 Booked lead/);
});

test("hvac demo (matrix) and a generic trade (avg fallback) both quote", async () => {
  const hvac = (await simulate({ businessName: "Cool Co", trade: "hvac" })).data;
  assert.equal(hvac.ok, true);
  assert.ok(hvac.quote, "hvac should produce a quote");
  assert.match(hvac.quote.range, /\$/);

  const generic = (await simulate({ businessName: "Handy Co", trade: "other", avgJobValue: 1200 })).data;
  assert.equal(generic.ok, true);
  assert.ok(generic.quote, "generic trade with avg job value should still quote");
});
