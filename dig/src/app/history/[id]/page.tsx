"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { ListSkeleton } from "@/components/Skeleton";
import { ExplanationChip } from "@/components/Explanation";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import type { DigState, TrailNode } from "@/features/discovery/service";

export default function TrailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<DigState | null>(null);
  useEffect(() => {
    api<DigState>(`/digs/${id}`)
      .then(setState)
      .catch(() => setState(null));
  }, [id]);
  if (!state)
    return (
      <Page title="Trail">
        <ListSkeleton />
      </Page>
    );
  const children = (pid: string | null) => state.trail.filter((n) => n.parentId === pid);
  const label = (n: TrailNode) =>
    n.explanation?.steps[n.explanation.steps.length - 1]?.toLabel ?? state.session.title;
  const fork = async (n: TrailNode) => {
    try {
      const f = await api<DigState>(`/digs/${id}/fork`, {
        method: "POST",
        json: { fromNodeId: n.id, mode: state.session.mode, distance: state.session.distance },
      });
      router.push(`/dig/${f.session.id}`);
    } catch {
      toast.push({ text: "Couldn't fork" });
    }
  };
  const Node = ({ n }: { n: TrailNode }) => (
    <li className="mt-2">
      <div
        className={`card p-3 ${n.id === state.session.currentNodeId ? "border-terracotta" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{label(n)}</p>
            <p className="muted text-xs">
              {n.outcome.replace("_", " ")} · depth {n.depth}
              {n.branchMode ? ` · ${n.branchMode.replace("_", " & ")}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="btn min-h-[36px] px-2 text-xs"
              onClick={async () => {
                await api(`/digs/${id}/action`, {
                  method: "POST",
                  json: { action: "jump", nodeId: n.id, idempotencyKey: `${Date.now()}-${n.id}` },
                }).catch(() => undefined);
                router.push(`/dig/${id}`);
              }}
            >
              Go here
            </button>
            <button type="button" className="btn min-h-[36px] px-2 text-xs" onClick={() => fork(n)}>
              Fork
            </button>
          </div>
        </div>
        {n.explanation && (
          <div className="mt-2">
            <ExplanationChip explanation={n.explanation} />
          </div>
        )}
      </div>
      {children(n.id).length > 0 && (
        <ul className="ml-4 border-l hairline pl-3">
          {children(n.id).map((c) => (
            <Node key={c.id} n={c} />
          ))}
        </ul>
      )}
    </li>
  );
  return (
    <Page
      title={state.session.title}
      actions={
        <Link href={`/dig/${id}`} className="btn btn-primary text-xs">
          Resume
        </Link>
      }
    >
      <p className="muted text-xs">
        {state.trail.length} stops · {state.session.stats.saved} saved · started{" "}
        {new Date(state.session.startedAt).toLocaleString()}
        {state.session.forkedFromSessionId && (
          <>
            {" "}
            · forked from{" "}
            <Link className="underline" href={`/history/${state.session.forkedFromSessionId}`}>
              another dig
            </Link>
          </>
        )}
      </p>
      <ul>
        {children(null).map((n) => (
          <Node key={n.id} n={n} />
        ))}
      </ul>
    </Page>
  );
}
