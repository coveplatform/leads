"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import type { Crate } from "@/features/crates/service";

export default function CratesPage() {
  const toast = useToast();
  const [data, setData] = useState<{
    crates: Crate[];
    views: Array<{ key: string; title: string; count: number }>;
  } | null>(null);
  const [title, setTitle] = useState("");
  const load = useCallback(
    () =>
      api<typeof data>("/crates")
        .then(setData)
        .catch(() => setData({ crates: [], views: [] })),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api("/crates", { method: "POST", json: { title } });
      setTitle("");
      await load();
    } catch {
      toast.push({ text: "Couldn't create crate" });
    }
  };
  const all = data?.crates.find((c) => c.systemKey === "all_finds");
  return (
    <Page
      title="Crates"
      actions={
        <>
          <a className="btn text-xs" href="/api/v1/crates/export?format=csv">
            CSV
          </a>
          <a className="btn text-xs" href="/api/v1/crates/export?format=json">
            JSON
          </a>
        </>
      }
    >
      {!data ? (
        <ListSkeleton />
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="crate-list">
            {data.crates.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/crates/${c.id}`}
                  className="card flex items-center justify-between p-4"
                >
                  <span>
                    <span className="block font-medium">{c.title}</span>
                    {c.description && <span className="muted block text-xs">{c.description}</span>}
                  </span>
                  <span className="chip">{c.itemCount}</span>
                </Link>
              </li>
            ))}
            {all &&
              data.views.map((v) => (
                <li key={v.key}>
                  <Link
                    href={`/crates/${all.id}?view=${v.key}`}
                    className="card flex items-center justify-between p-4 border-dashed"
                  >
                    <span>
                      <span className="block font-medium">{v.title}</span>
                      <span className="muted block text-xs">
                        A view across your finds, not a copy.
                      </span>
                    </span>
                    <span className="chip">{v.count}</span>
                  </Link>
                </li>
              ))}
          </ul>
          <form onSubmit={create} className="mt-6 flex gap-2">
            <label htmlFor="crate-title" className="visually-hidden">
              New crate title
            </label>
            <input
              id="crate-title"
              className="input"
              placeholder="New crate, e.g. “Tokyo 1983”"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </form>
          <p className="muted mt-6 text-xs">
            Your collection is yours: export everything as CSV or JSON any time, including
            unresolved links.
          </p>
        </>
      )}
    </Page>
  );
}
