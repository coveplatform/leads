// Signature validation runs against BASE_URL + the request path, with the
// form params the route parsed itself. A forged or missing signature is 403.
process.env.VERCEL = "1";
process.env.DATABASE_URL ||= "postgresql://u:p@localhost/cove_test"; // never reached by these requests
process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
process.env.BASE_URL = "https://cove.example";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";

const app = (await import("../src/server.js")).default;
let server, base;

before(async () => {
  await new Promise((res) => { server = app.listen(0, res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  delete process.env.TWILIO_AUTH_TOKEN;
});

// Empty From/To: a valid request that stops before any DB work.
const params = { From: "", To: "", CallSid: "CA123" };
const post = (signature) => fetch(`${base}/api/voice/inbound`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", ...(signature ? { "X-Twilio-Signature": signature } : {}) },
  body: new URLSearchParams(params),
});

test("a correctly signed webhook is accepted", async () => {
  const sig = twilio.getExpectedTwilioSignature("test-auth-token", "https://cove.example/api/voice/inbound", params);
  const r = await post(sig);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<Response>/);
});

test("a missing or forged signature is rejected", async () => {
  assert.equal((await post(null)).status, 403);
  const wrongUrl = twilio.getExpectedTwilioSignature("test-auth-token", "https://evil.example/api/voice/inbound", params);
  assert.equal((await post(wrongUrl)).status, 403);
});
