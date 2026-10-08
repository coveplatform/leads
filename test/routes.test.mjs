// Boots the real app with no database and checks the route surface: removed
// SaaS endpoints are gone, auth guards hold, and the Twilio webhooks always
// answer with valid TwiML / 200 even when the request can't be processed.
process.env.VERCEL = "1"; // don't auto-listen on import
process.env.DATABASE_URL ||= "postgresql://u:p@localhost/cove_test"; // never reached by these requests
delete process.env.TWILIO_AUTH_TOKEN; // skip signature validation

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const app = (await import("../src/server.js")).default;
const { signToken } = await import("../src/auth.js");
const ownerCookie = `cove_token=${signToken(1)}`;
let server, base;

before(async () => {
  await new Promise((res) => { server = app.listen(0, res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const post = (path, body, type = "json") => fetch(`${base}${path}`, {
  method: "POST",
  headers: { "Content-Type": type === "json" ? "application/json" : "application/x-www-form-urlencoded" },
  body: type === "json" ? JSON.stringify(body) : new URLSearchParams(body),
});

test("removed SaaS endpoints return 404", async () => {
  const gone = [
    ["POST", "/api/auth/signup"], ["GET", "/api/auth/google"], ["GET", "/api/auth/google/callback"],
    ["POST", "/api/auth/forgot-password"], ["POST", "/api/auth/reset-password"],
    ["POST", "/api/auth/provision-number"], ["POST", "/api/onboarding/save"],
    ["POST", "/api/trial/check"], ["POST", "/api/billing/checkout"], ["POST", "/api/billing/webhook"],
    ["GET", "/api/config/stripe-mode"], ["GET", "/api/me/roi"], ["POST", "/api/me/regenerate-flow"],
    ["POST", "/api/quote/simulate"], ["GET", "/api/cron/monthly-roi"], ["POST", "/api/demo"],
    ["POST", "/api/demo/send"], ["POST", "/api/webhook/podium/x"], ["GET", "/api/me/stats"],
  ];
  for (const [method, path] of gone) {
    // A signed-in owner gets past requireAuth, so /api/me/* reaches routing.
    const r = await fetch(`${base}${path}`, { method, headers: { cookie: ownerCookie } });
    assert.equal(r.status, 404, `${method} ${path}`);
  }
});

test("removed pages are not served", async () => {
  for (const path of ["/onboarding.html", "/demo.html", "/reset-password.html", "/cove.js"]) {
    const r = await fetch(`${base}${path}`);
    const text = await r.text();
    // Unknown non-API paths fall back to the marketing page.
    assert.ok(text.includes("<html") || r.status === 404, path);
    assert.ok(!text.includes("Stripe") && !text.includes("onboarding-wizard"), path);
  }
});

test("owner and admin APIs require a session", async () => {
  for (const path of ["/api/me/business", "/api/me/leads", "/api/auth/me", "/api/admin/businesses"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 401, path);
  }
});

test("voice webhook answers TwiML even for an unusable request", async () => {
  const r = await post("/api/voice/inbound", { From: "", To: "" }, "form");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /xml/);
  assert.match(await r.text(), /^<\?xml[\s\S]*<Response>[\s\S]*<\/Response>$/);
});

test("sms webhook rejects a payload without numbers", async () => {
  const r = await post("/api/sms/inbound", { Body: "hi" }, "form");
  assert.equal(r.status, 400);
});

test("login validates input before touching the database", async () => {
  const r = await post("/api/auth/login", {});
  assert.equal(r.status, 400);
});

test("health and dial pages", async () => {
  const h = await (await fetch(`${base}/health`)).json();
  assert.equal(h.ok, true);
  assert.equal((await fetch(`${base}/dial/abc`)).status, 400);
  assert.match(await (await fetch(`${base}/dial/${encodeURIComponent("**61*+61400000000#")}`)).text(), /tel:/);
});

test("cron endpoints refuse anyone but the scheduler", async () => {
  for (const path of ["/api/cron/dispatch", "/api/cron/health", "/api/cron/forwarding-check"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 401, path);
    const wrong = await fetch(`${base}${path}`, { headers: { authorization: "Bearer nope" } });
    assert.equal(wrong.status, 401, `${path} with a wrong secret`);
  }
});

test("dial_first status: an answered call just hangs up", async () => {
  const r = await post("/api/voice/status", { DialCallStatus: "completed", DialCallDuration: "60" }, "form");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<Response><Hangup\/><\/Response>/);
});

test("new owner endpoints require a session", async () => {
  for (const [method, path] of [["GET", "/api/me/summary"], ["GET", "/api/me/settings"], ["PUT", "/api/me/settings"], ["POST", "/api/me/leads/x/booking"]]) {
    assert.equal((await fetch(`${base}${path}`, { method })).status, 401, `${method} ${path}`);
  }
});
