import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

// ─── Password ───

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ─── JWT ───

export function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "30d" });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function setAuthCookie(res, token) {
  res.cookie("cove_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("cove_token", { path: "/" });
}

// ─── Middleware ───

export function requireAuth(req, res, next) {
  const token = req.cookies?.cove_token;
  if (!token) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired session" });
  }
}

export function requireAuthRedirect(req, res, next) {
  const token = req.cookies?.cove_token;
  if (!token) return res.redirect("/login");
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    return res.redirect("/login");
  }
}

export function redirectIfAuthed(req, res, next) {
  const token = req.cookies?.cove_token;
  if (!token) return next();
  try {
    verifyToken(token);
    return res.redirect("/dashboard");
  } catch {
    next();
  }
}
