"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { RecordRow } from "@/components/RecordCardView";
import { ListSkeleton } from "@/components/Skeleton";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { api, ClientApiError } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import type { Crate, CrateItem, Sort } from "@/features/crates/service";
import type { DigState } from "@/features/discovery/service";

const STATUSES = ["saved", "loved", "to_investigate", "want_vinyl", "heard", "own", "buy_later"];

function CrateInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const view = params.get("view") as "loved" | "to_investigate" | null;
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<{ crate: Crate; items: CrateItem[] } | null>(null);
  const [crates, setCrates] = useState<Crate[]>([]);
  const [sort, setSort] = useState<Sort>("saved_desc");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CrateItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ sort });
      if (q) sp.set("q", q);
      if (view) sp.set("view", view);
      setData(await api(`/crates/${id}/items?${sp}`));
      setCrates((await api<{ crates: Crate[] }>("/crates")).crates);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Couldn't load crate");
    }
  }, [id, sort, q, view]);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (item: CrateItem, body: Record<string, unknown>) => {
    try {
      await api(`/crates/${id}/items/${item.id}`, { method: "PATCH", json: body });
      await load();
    } catch {
      toast.push({ text: "Couldn't update" });
    }
  };
  const remove = async (item: CrateItem) => {
    try {
      await api(`/crates/${id}/items/${item.id}`, { method: "DELETE" });
      setEditing(null);
      await load();
    } catch {
      toast.push({ text: "Couldn't remove" });
    }
  };
  const bulkMove = async (target: string) => {
    for (const itemId of selected)
      await api(`/crates/${id}/items/${itemId}`, {
        method: "PATCH",
        json: { moveToCrateId: target },
      }).catch(() => undefined);
    setSelected(new Set());
    await load();
  };
  const dig = async (item: CrateItem) => {
    if (!item.recordingId) return;
    try {
      const d = await api<DigState>("/digs", {
        method: "POST",
        json: {
          seed: { type: "recording", id: item.recordingId },
          mode: "connections",
          distance: "explore",
        },
      });
      router.push(`/dig/${d.session.id}`);
    } catch {
      toast.push({ text: "Couldn't start a dig" });
    }
  };

  if (error)
    return (
      <Page title="Crate">
        <p className="muted">{error}</p>
      </Page>
    );
  if (!data)
    return (
      <Page>
        <ListSkeleton />
      </Page>
    );
  const title =
    view === "loved" ? "Loved" : view === "to_investigate" ? "To Investigate" : data.crate.title;
  return (
    <Page
      title={title}
      actions={
        <a className="btn text-xs" href={`/api/v1/crates/export?format=csv&crateId=${id}`}>
          Export CSV
        </a>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="visually-hidden" htmlFor="crate-q">
          Filter
        </label>
        <input
          id="crate-q"
          className="input max-w-xs"
          placeholder="Filter this crate"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          Sort
          <select
            className="input w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="saved_desc">Newest</option>
            <option value="saved_asc">Oldest</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="year">Year</option>
          </select>
        </label>
        {selected.size > 0 && (
          <label className="flex items-center gap-2 text-sm">
            Move {selected.size} to
            <select
              className="input w-auto"
              defaultValue=""
              onChange={(e) => e.target.value && bulkMove(e.target.value)}
            >
              <option value="" disabled>
                crate…
              </option>
              {crates
                .filter((c) => c.id !== id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {data.items.length === 0 ? (
        <p className="muted text-sm">
          Nothing here yet. Press <strong>Keep</strong> on a record while digging, or save a link
          from{" "}
          <Link className="underline" href="/imports">
            Imports
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y hairline" data-testid="crate-items">
          {data.items.map((it) => (
            <li key={it.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-4 h-5 w-5"
                aria-label="Select item"
                checked={selected.has(it.id)}
                onChange={(e) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(it.id);
                    else n.delete(it.id);
                    return n;
                  })
                }
              />
              <div className="min-w-0 flex-1">
                {it.card ? (
                  <RecordRow
                    card={it.card}
                    href={`/record/${it.recordingId}`}
                    right={
                      <button
                        type="button"
                        className="btn min-h-[40px] px-3 text-xs"
                        onClick={() => setEditing(it)}
                      >
                        Edit
                      </button>
                    }
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {it.source?.displayTitle ?? "Unidentified find"}
                      </div>
                      <a
                        className="muted block truncate text-xs underline"
                        href={it.source?.canonicalUrl ?? it.importedUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {it.source?.canonicalUrl ?? it.importedUrl}
                      </a>
                    </div>
                    <button
                      type="button"
                      className="btn min-h-[40px] px-3 text-xs"
                      onClick={() => setEditing(it)}
                    >
                      Edit
                    </button>
                  </div>
                )}
                <div className="muted -mt-1 flex flex-wrap gap-2 pb-2 text-xs">
                  <span>{it.loved ? "♥ loved" : it.status.replace("_", " ")}</span>
                  <span>saved {relativeTime(it.savedAt)}</span>
                  {it.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                  {it.notes && <span className="truncate">“{it.notes}”</span>}
                  {(it.source?.canonicalUrl || it.importedUrl) && (
                    <a
                      className="underline"
                      href={it.source?.canonicalUrl ?? it.importedUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      source link
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit saved item">
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void patch(editing, {
                notes: String(fd.get("notes") ?? ""),
                tags: String(fd.get("tags") ?? "")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                status: String(fd.get("status")),
              });
              setEditing(null);
            }}
          >
            <label className="block text-sm">
              Notes
              <textarea
                name="notes"
                className="input mt-1 min-h-[80px] py-2"
                defaultValue={editing.notes ?? ""}
              />
            </label>
            <label className="block text-sm">
              Tags (comma separated)
              <input name="tags" className="input mt-1" defaultValue={editing.tags.join(", ")} />
            </label>
            <label className="block text-sm">
              Status
              <select name="status" className="input mt-1" defaultValue={editing.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => patch(editing, { loved: !editing.loved })}
              >
                {editing.loved ? "Un-love" : "♥ Love"}
              </button>
              {editing.recordingId && (
                <button type="button" className="btn btn-accent" onClick={() => dig(editing)}>
                  Dig around this
                </button>
              )}
              {!editing.recordingId && (
                <span className="muted self-center text-xs">
                  Not enough metadata to dig from; identify it in Imports first.
                </span>
              )}
              <label className="flex items-center gap-2 text-sm">
                Copy to
                <select
                  className="input w-auto"
                  defaultValue=""
                  onChange={(e) =>
                    e.target.value && patch(editing, { copyToCrateId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    crate…
                  </option>
                  {crates
                    .filter((c) => c.id !== id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ghost text-terracotta"
                onClick={() => remove(editing)}
              >
                Remove
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </Page>
  );
}
export default function CratePage() {
  return (
    <Suspense
      fallback={
        <Page>
          <ListSkeleton />
        </Page>
      }
    >
      <CrateInner />
    </Suspense>
  );
}
