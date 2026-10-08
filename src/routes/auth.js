// Owner login. Accounts and initial passwords are created by the onboarding
// script; there is no signup, OAuth or self-serve reset.

import express from "express";
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
} from "../auth.js";
import { requireAuth, rateLimited } from "../middleware.js";
import {
  getUserById,
  getUserByEmail,
  getUserPasswordHash,
  updateUser,
  updatePassword,
  getBusinessByUserId,
} from "../db.js";

const router = express.Router();

router.post("/api/auth/login", async (req, res) => {
  try {
    if (await rateLimited(req, res, "login", 900, 10)) return; // 10 / 15 min per IP
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }

    const user = await getUserByEmail(String(email).toLowerCase().trim());
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    setAuthCookie(res, signToken(user.id));
    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "Could not sign in" });
  }
});

router.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) {
      clearAuthCookie(res);
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const business = await getBusinessByUserId(req.userId);
    return res.json({ ok: true, user, business: business || null });
  } catch (err) {
    console.error("Get me error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch user" });
  }
});

// Name and password change (owners swap Kris's temp password for their own).
router.patch("/api/auth/update-profile", requireAuth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body || {};
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ ok: false, error: "Current password required." });
      const hash = await getUserPasswordHash(req.userId);
      if (hash && !(await verifyPassword(currentPassword, hash))) {
        return res.status(400).json({ ok: false, error: "Current password is incorrect." });
      }
      if (newPassword.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
      await updatePassword(req.userId, await hashPassword(newPassword));
    }

    const updated = await updateUser(req.userId, { name: name || user.name });
    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ ok: false, error: "Could not update profile." });
  }
});

export default router;
