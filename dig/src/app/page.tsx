"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { RecordRow } from "@/components/RecordCardView";
import { ListSkeleton } from "@/components/Skeleton";
import { Sleeve } from "@/components/Sleeve";
import { useToast } from "@/components/Toast";
import { api, ClientApiError } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import type { RecordCard } from "@/domain/types";
import type { DigState, SessionSummary } from "@/features/discovery/service";
import type { ImportRecord } from "@/features/imports/service";

interface Scene {
  slug: string;
  title: string;
  blurb: string;
  count: number;
  sampleCard: RecordCard | null;
}

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [recent, setRecent] = useState<SessionSummary[] | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ImportRecord | null>(null);

  useEffect(() => {
    api<Scene[]>("/scenes")
      .then(setScenes)
      .catch(() => setScenes([]));
    api<{ sessions: SessionSummary[] }>("/digs?limit=5")
      .then((r) => setRecent(r.sessions))
      .catch(() => setRecent([]));
  }, []);

  const start = async (
    seed: { type: "recording" | "scene"; id?: string; slug?: string },
    label: string,
  ) => {
    setBusy(label);
    try {
      const dig = await api<DigState>("/digs", {
        method: "POST",
        json: { seed, mode: "connections", distance: "explore" },
      });
      router.push(`/dig/${dig.session.id}`);
    } catch (e) {
      toast.push({ text: e instanceof ClientApiError ? e.message : "Couldn't start that dig" });
      setBusy(null);
    }
  };

  const paste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy("paste");
    setResolved(null);
    try {
      const r = await api<ImportRecord>("/sources/resolve", { method: "POST", json: { url } });
      setResolved(r);
      if (r.status === "identified" && r.resolvedRecordingId) {
        await start({ type: "recording", id: r.resolvedRecordingId }, "paste");
        return;
      }
    } catch (err) {
      toast.push({ text: err instanceof ClientApiError ? err.message : "Couldn't read that link" });
    }
    setBusy(null);
  };

  const demo = async () => {
    setBusy("demo");
    try {
      const routes = await api<Array<{ items: RecordCard[] }>>("/seed-routes");
      const first = routes[0]?.items[0];
      if (!first) throw new Error("No seed routes");
      await start({ type: "recording", id: first.recording.id }, "demo");
    } catch {
      toast.push({ text: "Demo catalogue isn't loaded yet. Try again in a moment." });
      setBusy(null);
    }
  };

  return (
    <Page>
      <section className="pt-4 md:pt-10">
        <p className="font-serif text-3xl leading-tight md:text-5xl">
          Find something you weren&apos;t looking for.
        </p>
        <p className="muted mt-3 max-w-prose">
          Paste a track or pick a scene. Follow real connections: labels, aliases, remixers, scenes.
          Keep what you find. Turn back when a branch goes wrong, without teaching the app the wrong
          thing about you.
        </p>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-3">
        <form onSubmit={paste} className="card p-4 md:col-span-2">
          <label htmlFor="seed-url" className="block font-medium">
            Start with a track
          </label>
          <p className="muted mb-2 text-xs">
            YouTube, SoundCloud, Bandcamp, Discogs, Instagram or any link. Unrecognised links are
            kept, never lost.
          </p>
          <div className="flex gap-2">
            <input
              id="seed-url"
              className="input"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === "paste" ? "Reading…" : "Go"}
            </button>
          </div>
          {resolved && resolved.status !== "identified" && (
            <div className="mt-3 rounded-md border hairline p-3 text-sm">
              {resolved.status === "needs_confirmation" && (
                <p>
                  Is this one of these? Confirm the match in{" "}
                  <Link className="underline" href="/imports">
                    Imports
                  </Link>{" "}
                  and the dig can start from it.
                </p>
              )}
              {resolved.status === "unresolved" && (
                <p>
                  Saved as an <strong>Unidentified Find</strong>.{" "}
                  {resolved.kind === "mix"
                    ? "It looks like a whole set, so it isn't treated as one track."
                    : "We couldn't match it to a record in the catalogue."}{" "}
                  It&apos;s waiting in{" "}
                  <Link className="underline" href="/imports">
                    Imports
                  </Link>
                  ; search for something to dig from instead.
                </p>
              )}
              {resolved.status === "unsupported" && (
                <p>
                  {resolved.unsupportedReason ?? "That link isn't supported"}. It&apos;s kept in{" "}
                  <Link className="underline" href="/imports">
                    Imports
                  </Link>{" "}
                  so you can open it later.
                </p>
              )}
              {resolved.status === "failed_retryable" && (
                <p>
                  The provider didn&apos;t answer. The link is saved in{" "}
                  <Link className="underline" href="/imports">
                    Imports
                  </Link>
                  ; try again later.
                </p>
              )}
            </div>
          )}
        </form>
        <button
          type="button"
          className="card flex flex-col items-start p-4 text-left"
          onClick={demo}
          disabled={busy !== null}
          data-testid="demo-dig"
        >
          <span className="font-medium">Try a demo dig</span>
          <span className="muted mt-1 text-xs">
            Start from an editor&apos;s seed route. No sign-up, nothing to configure.
          </span>
          <span className="btn btn-accent mt-auto pt-0 self-stretch" aria-hidden>
            {busy === "demo" ? "Starting…" : "Start digging"}
          </span>
        </button>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold">Choose a scene</h2>
        <p className="muted mb-3 text-xs">
          A scene is a starting point for this dig only. It doesn&apos;t become your taste.
        </p>
        {!scenes ? (
          <ListSkeleton rows={4} />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scenes.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  className="card flex w-full items-center gap-3 p-3 text-left"
                  onClick={() => start({ type: "scene", slug: s.slug }, s.slug)}
                  disabled={busy !== null}
                  data-testid={`scene-${s.slug}`}
                >
                  {s.sampleCard && <Sleeve card={s.sampleCard} size="sm" />}
                  <span className="min-w-0">
                    <span className="block font-medium">{s.title}</span>
                    <span className="muted block truncate text-xs">
                      {s.blurb} · {s.count} records
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent digs</h2>
          <Link href="/history" className="text-sm underline">
            All history
          </Link>
        </div>
        {!recent ? (
          <ListSkeleton rows={2} />
        ) : recent.length === 0 ? (
          <p className="muted text-sm">
            Nothing yet. Your trails will appear here and can be resumed any time.
          </p>
        ) : (
          <ul className="divide-y hairline">
            {recent.map((s) => (
              <li key={s.id}>
                {s.seedCard ? (
                  <RecordRow
                    card={{ ...s.seedCard }}
                    href={`/dig/${s.id}`}
                    right={
                      <span className="muted shrink-0 text-xs">
                        {relativeTime(s.lastActivityAt)}
                      </span>
                    }
                  />
                ) : (
                  <Link href={`/dig/${s.id}`} className="block py-3">
                    {s.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted mt-10 text-xs">
        Demo catalogue: editor-entered sample metadata, clearly tagged. Sample records open a
        provider search rather than claiming a verified upload.{" "}
        <Link href="/profile" className="underline">
          Privacy, export and delete
        </Link>
        .
      </p>
    </Page>
  );
}
