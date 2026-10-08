import twilio from "twilio";
import { config } from "./config.js";
import { verifyToken } from "./auth.js";
import { getUserById, rateLimitExceeded } from "./db.js";

export { requireAuth, requireAuthRedirect, redirectIfAuthed } from "./auth.js";

// Client IP for rate limiting. Behind Vercel/proxies the real IP is the first
// entry in x-forwarded-for; fall back to the socket address locally.
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Per-IP rate-limit guard for an endpoint. Returns true (and sends a 429) when
// the caller is over the limit; the route should bail. Fails open on DB error.
export async function rateLimited(req, res, bucket, windowSeconds, max) {
  try {
    if (await rateLimitExceeded(bucket, clientIp(req), windowSeconds, max)) {
      res.status(429).json({ ok: false, error: "Too many attempts. Please wait a few minutes and try again." });
      return true;
    }
  } catch { /* rate-limit table unavailable — don't block the user */ }
  return false;
}

// ─── Twilio signature validation ───
// Validates against the same public URL the numbers' webhooks are configured
// with (see services/twilio-numbers.js), so the signature always matches.
export function validateTwilioSignature(req, res, next) {
  if (!config.twilio.authToken) return next(); // skip in dev / when Twilio not configured
  const signature = req.headers["x-twilio-signature"] || "";
  const url = `${config.publicBaseUrl}${req.originalUrl}`;
  if (!twilio.validateRequest(config.twilio.authToken, signature, url, req.body || {})) {
    console.warn("[twilio] Rejected request with invalid signature from", req.ip);
    return res.status(403).send("Forbidden");
  }
  next();
}

// ─── Admin (Kris only) ───

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "kris.engelhardt4@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase());

async function resolveAdmin(req) {
  const token = req.cookies?.cove_token;
  if (!token) return { status: 401 };
  let userId;
  try {
    userId = verifyToken(token).userId;
  } catch {
    return { status: 401 };
  }
  const user = await getUserById(userId);
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) return { status: 403 };
  return { userId };
}

export async function requireAdmin(req, res, next) {
  try {
    const { status, userId } = await resolveAdmin(req);
    if (status === 401) return res.status(401).json({ ok: false, error: "Not authenticated" });
    if (status === 403) return res.status(403).json({ ok: false, error: "Admin access required" });
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdminRedirect(req, res, next) {
  try {
    const { status, userId } = await resolveAdmin(req);
    if (status === 401) return res.redirect("/login");
    if (status === 403) return res.status(403).send("Access denied — admin only.");
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
