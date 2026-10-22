"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { ListSkeleton } from "@/components/Skeleton";
import { Sleeve } from "@/components/Sleeve";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import { MODE_LABEL, relativeTime } from "@/lib/client/format";
import type { SessionSummary } from "@/features/discovery/service";

export default function HistoryPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [archived, setArchived] = useState(false);
  const load = (a = archived) =>
    api<{ sessions: SessionSummary[] }>(`/digs?limit=50${a ? "&archived=1" : ""}`)
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  useEffect(() => {
    void load(archived);
  }, [archived]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/digs/${id}`, { method: "PATCH", json: body });
      await load();
    } catch {
      toast.push({ text: "Couldn't update" });
    }
  };
  return (
    <Page
      title="History"
      actions={
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          show archived
        </label>
      }
    >
      {!sessions ? (
        <ListSkeleton />
      ) : sessions.length === 0 ? (
        <p className="muted text-sm">
          No digs yet.{" "}
          <Link href="/" className="underline">
            Start one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2" data-testid="history-list">
          {sessions.map((s) => (
            <li key={s.id} className="card flex gap-3 p-3">
              {s.seedCard && (
                <Link href={`/dig/${s.id}`} className="shrink-0">
                  <Sleeve card={s.seedCard} size="md" />
                </Link>
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/dig/${s.id}`} className="block truncate font-medium">
                  {s.title}
                </Link>
                <p className="muted text-xs">
                  {relativeTime(s.lastActivityAt)} · {s.stats.considered} considered ·{" "}
                  {s.stats.saved} saved · {s.stats.branches} forks
                  {s.stats.modesUsed.length
                    ? ` · ${s.stats.modesUsed.map((m) => MODE_LABEL[m]).join(", ")}`
                    : ""}
                  {s.status === "archived" ? " · archived" : ""}
                  {s.seedType === "fork" ? " · forked" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Link href={`/dig/${s.id}`} className="btn btn-primary min-h-[36px] px-3">
                    Resume
                  </Link>
                  <Link href={`/history/${s.id}`} className="btn min-h-[36px] px-3">
                    Trail
                  </Link>
                  <button
                    type="button"
                    className="btn min-h-[36px] px-3"
                    onClick={() => {
                      const t = prompt("Rename dig", s.title);
                      if (t) void patch(s.id, { title: t });
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn min-h-[36px] px-3"
                    onClick={() =>
                      patch(s.id, { status: s.status === "archived" ? "active" : "archived" })
                    }
                  >
                    {s.status === "archived" ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[36px] px-3 text-terracotta"
                    onClick={() => {
                      if (confirm("Delete this dig and its trail?"))
                        void patch(s.id, { status: "deleted" });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
