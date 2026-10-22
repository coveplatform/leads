"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import type { Profile } from "@/features/taste/service";

interface Taste {
  enabled: boolean;
  strength: string;
  signalCount: number;
  tags: Array<{ id: string; name: string; affinity: number }>;
  artists: Array<{ id: string; name: string; affinity: number }>;
  labels: Array<{ id: string; name: string; affinity: number }>;
}

export default function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<(Profile & { kind: string }) | null>(null);
  const [taste, setTaste] = useState<Taste | null>(null);
  const [prefs, setPrefs] = useState({ motion: "", contrast: "", theme: "" });
  const load = async () => {
    setProfile(await api("/profile"));
    setTaste(await api("/profile/taste"));
  };
  useEffect(() => {
    void load().catch(() => undefined);
    try {
      setPrefs({
        motion: localStorage.getItem("dig:motion") ?? "",
        contrast: localStorage.getItem("dig:contrast") ?? "",
        theme: localStorage.getItem("dig:theme") ?? "",
      });
    } catch {
      /* ignore */
    }
  }, []);
  const patch = async (body: Record<string, unknown>) => {
    // Optimistic: flip the control at once, then confirm with the server.
    setProfile((p) => (p ? { ...p, ...(body as Partial<Profile>) } : p));
    try {
      setProfile({
        ...(await api<Profile>("/profile", { method: "PATCH", json: body })),
        kind: profile?.kind ?? "guest",
      });
      setTaste(await api("/profile/taste"));
    } catch {
      toast.push({ text: "Couldn't save" });
      await load().catch(() => undefined);
    }
  };
  const setPref = (k: "motion" | "contrast" | "theme", v: string) => {
    try {
      if (v) localStorage.setItem(`dig:${k}`, v);
      else localStorage.removeItem(`dig:${k}`);
    } catch {
      /* ignore */
    }
    setPrefs((p) => ({ ...p, [k]: v }));
    const root = document.documentElement;
    if (k === "motion") {
      if (v) root.dataset.motion = v;
      else delete root.dataset.motion;
    }
    if (k === "contrast") {
      if (v) root.dataset.contrast = v;
      else delete root.dataset.contrast;
    }
    if (k === "theme") {
      if (v) root.dataset.theme = v;
      else delete root.dataset.theme;
    }
  };

  if (!profile || !taste)
    return (
      <Page title="Profile">
        <ListSkeleton />
      </Page>
    );
  return (
    <Page title="Profile & settings">
      <section className="card p-4">
        <h2 className="font-semibold">Account</h2>
        <p className="muted mt-1 text-sm">
          You&apos;re digging as a <strong>guest</strong>. Your crates and history live in this
          browser&apos;s session cookie. Sign-in (to sync across devices) needs Supabase Auth
          credentials and is switched off in this build; see the README.
        </p>
      </section>

      <section className="card mt-3 p-4" data-testid="personalisation">
        <h2 className="font-semibold">Discovery personalisation</h2>
        <p className="muted mt-1 text-sm">
          Two independent settings. Session interests (what you pass, keep or reject in a dig) never
          change your stable taste; only these do.
        </p>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>
            Use my Loved &amp; Kept items to improve discovery{" "}
            <span className="muted block text-xs">
              Off by default. When on, Love adds a strong stable signal and Keep a weak one.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={profile.personalizationOptIn}
            onChange={(e) => patch({ personalizationOptIn: e.target.checked })}
            data-testid="opt-in"
          />
        </label>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>
            Personalisation strength{" "}
            <span className="muted block text-xs">
              Caps the influence at ±5% of a score. Light is the recommended default.
            </span>
          </span>
          <select
            className="input w-auto"
            value={profile.personalizationStrength}
            onChange={(e) => patch({ personalizationStrength: e.target.value })}
            data-testid="strength"
          >
            <option value="off">Off</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
          </select>
        </label>
      </section>

      <section className="card mt-3 p-4" data-testid="stable-taste">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Stable taste</h2>
          <span className="chip">{taste.signalCount} signals</span>
        </div>
        {!taste.enabled ? (
          <p className="muted mt-1 text-sm">
            Personalisation is off, so no stable taste is being built or used.
          </p>
        ) : taste.signalCount === 0 ? (
          <p className="muted mt-1 text-sm">
            Nothing yet. Love a record while digging to add to it.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="muted text-xs uppercase">Tags</p>
              {taste.tags.map((t) => (
                <p key={t.id}>
                  {t.name}{" "}
                  <span className="muted">
                    {t.affinity > 0 ? "+" : ""}
                    {t.affinity}
                  </span>
                </p>
              ))}
            </div>
            <div>
              <p className="muted text-xs uppercase">Artists</p>
              {taste.artists.map((t) => (
                <p key={t.id}>
                  {t.name} <span className="muted">+{t.affinity}</span>
                </p>
              ))}
            </div>
            <div>
              <p className="muted text-xs uppercase">Labels</p>
              {taste.labels.map((t) => (
                <p key={t.id}>
                  {t.name} <span className="muted">+{t.affinity}</span>
                </p>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="btn mt-3"
          onClick={async () => {
            if (confirm("Clear all stable taste signals?")) {
              await api("/profile/taste", { method: "DELETE" });
              await load();
            }
          }}
        >
          Clear stable taste
        </button>
      </section>

      <section className="card mt-3 p-4">
        <h2 className="font-semibold">Temporary session history</h2>
        <p className="muted mt-1 text-sm">
          Your digs and their branch state. Clearing this does not touch your crates or stable
          taste.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/history" className="btn">
            View history
          </Link>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (confirm("Delete all dig history?")) {
                await api("/profile/sessions", { method: "DELETE" });
                toast.push({ text: "Session history cleared" });
              }
            }}
          >
            Clear session history
          </button>
        </div>
      </section>

      <section className="card mt-3 p-4">
        <h2 className="font-semibold">Accessibility & display</h2>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <label>
            Motion
            <select
              className="input mt-1"
              value={prefs.motion}
              onChange={(e) => setPref("motion", e.target.value)}
            >
              <option value="">Follow system</option>
              <option value="reduced">Reduced</option>
            </select>
          </label>
          <label>
            Contrast
            <select
              className="input mt-1"
              value={prefs.contrast}
              onChange={(e) => setPref("contrast", e.target.value)}
            >
              <option value="">Default</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Theme
            <select
              className="input mt-1"
              value={prefs.theme}
              onChange={(e) => setPref("theme", e.target.value)}
            >
              <option value="">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card mt-3 p-4">
        <h2 className="font-semibold">Your data</h2>
        <p className="muted mt-1 text-sm">
          Export everything (profile, taste summary, crates, sessions, imports) or delete it.
          Deletion removes all private state and signs you out of this guest session.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn" href="/api/v1/profile/export">
            Export all (JSON)
          </a>
          <a className="btn" href="/api/v1/crates/export?format=csv">
            Crates (CSV)
          </a>
          <Link className="btn" href="/imports">
            Imports inbox
          </Link>
          <button
            type="button"
            className="btn btn-ghost text-terracotta"
            onClick={async () => {
              if (prompt("Type DELETE to erase everything") === "DELETE") {
                await api("/profile/delete", { method: "POST", json: { confirm: "DELETE" } });
                location.href = "/";
              }
            }}
          >
            Delete my data
          </button>
        </div>
      </section>
      <p className="muted mt-6 text-xs">
        Privacy: crates are private by default; no listening data is sold; analytics are first-party
        product events kept with your session and deleted with it.
      </p>
    </Page>
  );
}
