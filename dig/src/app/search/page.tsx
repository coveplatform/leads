"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { RecordRow } from "@/components/RecordCardView";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { SearchResults } from "@/features/search/service";
import type { DigState } from "@/features/discovery/service";
import type { RecordCard } from "@/domain/types";

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [yearFrom, setYearFrom] = useState(params.get("yearFrom") ?? "");
  const [yearTo, setYearTo] = useState(params.get("yearTo") ?? "");
  const tag = params.get("tag");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term && !tag) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ q: term });
      if (yearFrom) sp.set("yearFrom", yearFrom);
      if (yearTo) sp.set("yearTo", yearTo);
      if (tag) sp.set("tag", tag);
      api<SearchResults>(`/search?${sp}`)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, yearFrom, yearTo, tag]);

  const startDig = async (card: RecordCard) => {
    try {
      const d = await api<DigState>("/digs", {
        method: "POST",
        json: {
          seed: { type: "recording", id: card.recording.id },
          mode: "connections",
          distance: "explore",
        },
      });
      router.push(`/dig/${d.session.id}`);
    } catch (e) {
      toast.push({ text: e instanceof ClientApiError ? e.message : "Couldn't start" });
    }
  };
  const save = async (card: RecordCard) => {
    try {
      const crates = await api<{ crates: Array<{ id: string; systemKey: string | null }> }>(
        "/crates",
      );
      const all = crates.crates.find((c) => c.systemKey === "all_finds");
      if (!all) throw new Error();
      await api(`/crates/${all.id}/items`, {
        method: "POST",
        json: { recordingId: card.recording.id },
      });
      toast.push({
        text: "Saved to All Finds",
        actionLabel: "Open",
        onAction: () => router.push(`/crates/${all.id}`),
      });
    } catch {
      toast.push({ text: "Couldn't save" });
    }
  };

  return (
    <Page title="Search">
      <label htmlFor="q" className="visually-hidden">
        Search recordings, artists, labels, scenes
      </label>
      <input
        id="q"
        className="input"
        placeholder="Track, artist, label, scene…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        data-testid="search-input"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          From{" "}
          <input
            className="input w-24"
            inputMode="numeric"
            placeholder="1985"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </label>
        <label className="flex items-center gap-1">
          To{" "}
          <input
            className="input w-24"
            inputMode="numeric"
            placeholder="1999"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </label>
        {tag && (
          <span className="chip chip-accent">
            tag: {tag}{" "}
            <Link href="/search" className="underline">
              clear
            </Link>
          </span>
        )}
      </div>
      {loading && (
        <div className="mt-4">
          <ListSkeleton rows={3} />
        </div>
      )}
      {!loading && results && (
        <div className="mt-4 space-y-6">
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide muted">Recordings</h2>
            {results.recordings.length === 0 ? (
              <p className="muted text-sm">No recordings match.</p>
            ) : (
              <ul className="divide-y hairline" data-testid="search-recordings">
                {results.recordings.map((c) => (
                  <li key={c.recording.id}>
                    <RecordRow
                      card={c}
                      href={`/record/${c.recording.id}`}
                      right={
                        <span className="flex gap-1">
                          <button
                            type="button"
                            className="btn min-h-[40px] px-3 text-xs"
                            onClick={() => save(c)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary min-h-[40px] px-3 text-xs"
                            onClick={() => startDig(c)}
                            data-testid="start-dig"
                          >
                            Start dig
                          </button>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {results.artists.length > 0 && (
            <Group title="Artists">
              {results.artists.map((a) => (
                <Link key={a.id} href={`/search?q=${encodeURIComponent(a.name)}`} className="chip">
                  {a.name}
                  {a.aliases.length ? (
                    <span className="muted"> · aka {a.aliases.join(", ")}</span>
                  ) : null}{" "}
                  · {a.recordingCount}
                </Link>
              ))}
            </Group>
          )}
          {results.labels.length > 0 && (
            <Group title="Labels">
              {results.labels.map((l) => (
                <Link key={l.id} href={`/search?q=${encodeURIComponent(l.name)}`} className="chip">
                  {l.name} · {l.recordingCount}
                </Link>
              ))}
            </Group>
          )}
          {results.tags.length > 0 && (
            <Group title="Tags & scenes">
              {results.tags.map((t) => (
                <Link
                  key={t.id}
                  href={`/search?tag=${encodeURIComponent(t.slug)}`}
                  className="chip"
                >
                  {t.name} · {t.recordingCount}
                </Link>
              ))}
            </Group>
          )}
          {results.releases.length > 0 && (
            <Group title="Releases">
              {results.releases.map((r) => (
                <span key={r.id} className="chip">
                  {r.title}
                  {r.label ? ` · ${r.label}` : ""}
                  {r.year ? ` · ${r.year}` : ""}
                </span>
              ))}
            </Group>
          )}
          {results.imports.length > 0 && (
            <Group title="Your imports">
              {results.imports.map((i) => (
                <Link key={i.id} href="/imports" className="chip">
                  {i.title ?? i.url} · {i.status.replace("_", " ")}
                </Link>
              ))}
            </Group>
          )}
        </div>
      )}
      {!loading && !results && (
        <p className="muted mt-4 text-sm">
          Search the catalogue and your saved imports. Try “Chain Reaction”, “Larry Heard”, or a
          scene like “dub techno”.
        </p>
      )}
    </Page>
  );
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide muted">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <Page title="Search">
          <ListSkeleton />
        </Page>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
