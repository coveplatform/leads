"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { RecordRow } from "@/components/RecordCardView";
import { ListSkeleton } from "@/components/Skeleton";
import { Player } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { api, ClientApiError } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import type { ImportRecord } from "@/features/imports/service";
import type { DigState } from "@/features/discovery/service";

const STATUS_LABEL: Record<ImportRecord["status"], string> = {
  identified: "Identified",
  needs_confirmation: "Needs confirmation",
  unresolved: "Unidentified find",
  unsupported: "Unsupported (kept as link)",
  failed_retryable: "Provider unavailable (retry)",
};

export default function ImportsPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<ImportRecord[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const load = () =>
    api<ImportRecord[]>(`/imports${filter ? `?status=${filter}` : ""}`)
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // PWA share target / ?url= deep link: prefill the box.
    const u =
      new URLSearchParams(window.location.search).get("url") ??
      new URLSearchParams(window.location.search).get("text");
    if (u) setText(u);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    try {
      await api("/imports", { method: "POST", json: { urls } });
      setText("");
      await load();
    } catch (err) {
      toast.push({ text: err instanceof ClientApiError ? err.message : "Couldn't import" });
    } finally {
      setBusy(false);
    }
  };
  const confirmMatch = async (imp: ImportRecord, entityId: string | null) => {
    try {
      await api(`/imports/${imp.id}/confirm`, { method: "POST", json: { entityId } });
      await load();
    } catch {
      toast.push({ text: "Couldn't confirm" });
    }
  };
  const save = async (imp: ImportRecord) => {
    try {
      const { crates } = await api<{ crates: Array<{ id: string; systemKey: string | null }> }>(
        "/crates",
      );
      const all = crates.find((c) => c.systemKey === "all_finds")!;
      await api(`/crates/${all.id}/items`, {
        method: "POST",
        json: imp.resolvedRecordingId
          ? { recordingId: imp.resolvedRecordingId }
          : { sourceId: imp.sourceId },
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
  const dig = async (imp: ImportRecord) => {
    if (!imp.resolvedRecordingId) return;
    try {
      const d = await api<DigState>("/digs", {
        method: "POST",
        json: {
          seed: { type: "recording", id: imp.resolvedRecordingId },
          mode: "connections",
          distance: "explore",
        },
      });
      router.push(`/dig/${d.session.id}`);
    } catch {
      toast.push({ text: "Couldn't start" });
    }
  };
  const rename = async (imp: ImportRecord) => {
    const t = prompt("Title for this find", imp.userTitle ?? imp.title ?? "");
    if (t === null) return;
    await api(`/imports/${imp.id}`, { method: "PATCH", json: { userTitle: t } }).catch(
      () => undefined,
    );
    await load();
  };
  const note = async (imp: ImportRecord) => {
    const t = prompt("Notes", imp.userNotes ?? "");
    if (t === null) return;
    await api(`/imports/${imp.id}`, { method: "PATCH", json: { userNotes: t } }).catch(
      () => undefined,
    );
    await load();
  };
  const del = async (imp: ImportRecord) => {
    if (!confirm("Remove this import? Saved crate items are kept.")) return;
    await api(`/imports/${imp.id}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  };

  return (
    <Page
      title="Imports"
      intro={
        <p className="muted mb-3 text-sm">
          Paste one or many links. Nothing is lost: supported links are matched where we can, the
          rest wait here as bookmarks you can title, note and save.
        </p>
      }
    >
      <form onSubmit={submit} className="card p-3">
        <label htmlFor="urls" className="visually-hidden">
          Links to import
        </label>
        <textarea
          id="urls"
          className="input min-h-[88px] py-2"
          placeholder={
            "https://youtu.be/…\nhttps://soundcloud.com/…\nhttps://…bandcamp.com/track/…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="import-textarea"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <select
            className="input w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            data-testid="import-submit"
          >
            {busy ? "Reading…" : "Import"}
          </button>
        </div>
      </form>
      {!items ? (
        <div className="mt-4">
          <ListSkeleton />
        </div>
      ) : items.length === 0 ? (
        <p className="muted mt-4 text-sm">Inbox empty.</p>
      ) : (
        <ul className="mt-4 space-y-3" data-testid="import-list">
          {items.map((imp) => (
            <li key={imp.id} className="card p-3" data-status={imp.status}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {imp.userTitle ?? imp.title ?? imp.source?.displayTitle ?? "Untitled link"}
                    {imp.artist ? <span className="muted"> · {imp.artist}</span> : null}
                  </p>
                  <a
                    className="muted block truncate text-xs underline"
                    href={imp.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {imp.originalUrl}
                  </a>
                  <p className="muted mt-1 text-xs">
                    <span className="chip">{STATUS_LABEL[imp.status]}</span>{" "}
                    <span className="chip capitalize">{imp.provider}</span>{" "}
                    {imp.kind === "mix" && <span className="chip">mix / unknown track</span>}{" "}
                    {relativeTime(imp.createdAt)}
                    {imp.unsupportedReason ? ` · ${imp.unsupportedReason}` : ""}
                    {imp.userNotes ? ` · “${imp.userNotes}”` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    className="btn min-h-[36px] px-2 text-xs"
                    onClick={() => save(imp)}
                  >
                    Save
                  </button>
                  {imp.status === "identified" && (
                    <button
                      type="button"
                      className="btn btn-accent min-h-[36px] px-2 text-xs"
                      onClick={() => dig(imp)}
                    >
                      Dig around this
                    </button>
                  )}
                </div>
              </div>
              {imp.status === "needs_confirmation" && imp.matchCandidates.length > 0 && (
                <div className="mt-3 rounded-md border hairline p-2">
                  <p className="mb-1 text-sm font-medium">Is this the right recording?</p>
                  <ul className="divide-y hairline">
                    {imp.matchCandidates.map(
                      (c) =>
                        c.card && (
                          <li key={c.recordingId}>
                            <RecordRow
                              card={c.card}
                              right={
                                <button
                                  type="button"
                                  className="btn min-h-[36px] px-2 text-xs"
                                  onClick={() => confirmMatch(imp, c.recordingId)}
                                >
                                  Yes, this one
                                </button>
                              }
                            />
                            <p className="muted -mt-1 pb-1 text-xs">
                              {c.reason} · {Math.round(c.confidence * 100)}%
                            </p>
                          </li>
                        ),
                    )}
                  </ul>
                  <button
                    type="button"
                    className="btn mt-2 min-h-[36px] text-xs"
                    onClick={() => confirmMatch(imp, null)}
                  >
                    None of these, keep as unidentified
                  </button>
                </div>
              )}
              {imp.status === "identified" && imp.card && (
                <div className="mt-2">
                  <RecordRow card={imp.card} href={`/record/${imp.card.recording.id}`} />
                </div>
              )}
              {imp.player && imp.status !== "unsupported" && (
                <div className="mt-2">
                  <Player player={imp.player} title={imp.title ?? imp.originalUrl} />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" className="btn min-h-[32px] px-2" onClick={() => rename(imp)}>
                  Title
                </button>
                <button type="button" className="btn min-h-[32px] px-2" onClick={() => note(imp)}>
                  Notes
                </button>
                {imp.status !== "identified" && (
                  <Link
                    href={`/search?q=${encodeURIComponent(imp.userTitle ?? imp.title ?? "")}`}
                    className="btn min-h-[32px] px-2"
                  >
                    Search catalogue
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-ghost min-h-[32px] px-2 text-terracotta"
                  onClick={() => del(imp)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
