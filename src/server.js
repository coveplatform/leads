import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { requireAdminRedirect, redirectIfAuthed } from "./middleware.js";
import webhookRoutes from "./routes/webhooks.js";
import authRoutes from "./routes/auth.js";
import ownerRoutes from "./routes/owner.js";
import adminRoutes from "./routes/admin.js";
import cronRoutes from "./routes/cron.js";
import { log } from "./log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const page = (file) => (_req, res) => res.sendFile(path.join(publicDir, file));

const app = express();

// Twilio webhooks parse their own urlencoded bodies (see routes/webhooks.js).
app.use(express.json());
app.use(cookieParser());

// Protect admin.html before static middleware can serve it publicly
app.get(["/admin", "/admin.html"], requireAdminRedirect, page("admin.html"));

app.use(express.static(publicDir));

// ─── Pages ───

app.get("/login", redirectIfAuthed, page("login.html"));
app.get("/dashboard", page("dashboard.html"));
app.get("/privacy", page("privacy.html"));
app.get("/terms", page("terms.html"));

// Tappable dial link — sent to owners so they tap a forwarding code instead of typing it
app.get("/dial/:code", (req, res) => {
  const code = decodeURIComponent(req.params.code);
  // Only allow dial codes (digits, *, #, +)
  if (!/^[\d*#+]+$/.test(code)) return res.status(400).send("Invalid code");
  const tel = `tel:${encodeURIComponent(code)}`;
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening dialler…</title><meta http-equiv="refresh" content="0;url=${tel}"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafaf8"><div style="text-align:center"><div style="font-size:2rem;margin-bottom:.5rem">📞</div><p style="color:#3f3f46;font-size:.95rem">Opening your dialler…</p><p style="margin-top:.75rem"><a href="${tel}" style="color:#e8540a;font-weight:600">Tap here if it didn't open</a></p></div></body></html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cove", timestamp: new Date().toISOString() });
});

// ─── API ───

app.use(webhookRoutes);
app.use(authRoutes);
app.use(ownerRoutes);
app.use(adminRoutes);
app.use(cronRoutes);

// ─── Fallbacks ───

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.use((err, _req, res, _next) => {
  log.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Cove listening on port ${config.port}`);
  });
}

export default app;
