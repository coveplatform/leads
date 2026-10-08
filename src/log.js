// Logging with a request id, so one call can be traced across the voice
// webhook, the SMS replies it triggers and the DB writes in between. The id is
// the Twilio CallSid / MessageSid when there is one.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

const store = new AsyncLocalStorage();

export function requestId() {
  return store.getStore()?.id || null;
}

const withId = (args) => {
  const id = requestId();
  return id ? [`[${id}]`, ...args] : args;
};

export const log = {
  info: (...args) => console.log(...withId(args)),
  warn: (...args) => console.warn(...withId(args)),
  error: (...args) => console.error(...withId(args)),
};

// Express middleware: run the rest of the request inside a request-id context.
export function withRequestId(req, res, next) {
  const id = req.body?.CallSid || req.body?.MessageSid || req.headers["x-vercel-id"]?.split("::").pop()
    || randomBytes(6).toString("hex");
  res.setHeader("X-Request-Id", id);
  store.run({ id }, next);
}

// Run a background job (cron) with its own id.
export function runWithId(id, fn) {
  return store.run({ id }, fn);
}
