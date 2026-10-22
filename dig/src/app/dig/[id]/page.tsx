"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Page } from "@/components/Page";
import { RecordHero, RecordRow } from "@/components/RecordCardView";
import { Player } from "@/components/Player";
import { ExplanationChip } from "@/components/Explanation";
import { Sheet } from "@/components/Sheet";
import { CardSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { api, ClientApiError, idempotencyKey } from "@/lib/client/api";
import {
  DISTANCE_BLURB,
  DISTANCE_LABEL,
  MODE_BLURB,
  MODE_LABEL,
  cardTitle,
} from "@/lib/client/format";
import {
  DIG_DISTANCES,
  DIG_MODES,
  type DigDistance,
  type DigMode,
  type WrongDirectionReason,
} from "@/domain/types";
import type { DigState, TrailNode } from "@/features/discovery/service";

const REASONS: Array<{ code: WrongDirectionReason; label: string }> = [
  { code: "too_polished", label: "Too polished" },
  { code: "too_aggressive", label: "Too aggressive" },
  { code: "too_similar", label: "Too similar" },
  { code: "too_far_from_seed", label: "Too far from seed" },
  { code: "wrong_era", label: "Wrong era" },
  { code: "not_interested_in_branch", label: "Not interested in this branch" },
  { code: "other", label: "Other" },
];

export default function DigPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<DigState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "dig" | "wrong" | "trail" | "tutorial">(null);
  const [mode, setMode] = useState<DigMode>("connections");
  const [distance, setDistance] = useState<DigDistance>("explore");
  const [note, setNote] = useState<{ text: string; changed?: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<DigState>(`/digs/${id}/resume`, { method: "POST" });
      setState(s);
      setMode(s.session.mode);
      setDistance(s.session.distance);
      try {
        if (!localStorage.getItem("dig:tutorial")) setSheet("tutorial");
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Couldn't load this dig");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        const s = await api<DigState>(`/digs/${id}/action`, {
          method: "POST",
          json: { ...body, idempotencyKey: idempotencyKey() },
        });
        setState(s);
        if (s.sessionNote) setNote({ text: s.sessionNote, changed: s.changed });
        return s;
      } catch (e) {
        toast.push({ text: e instanceof ClientApiError ? e.message : "That didn't work" });
      } finally {
        setBusy(false);
      }
    },
    [busy, id, toast],
  );

  const openDig = async () => {
    setSheet("dig");
    try {
      const s = await api<DigState>(`/digs/${id}/next`, {
        method: "POST",
        json: { mode, distance },
      });
      setState(s);
    } catch {
      /* keep existing */
    }
  };
  const refreshSuggestions = async (m: DigMode, d: DigDistance) => {
    setMode(m);
    setDistance(d);
    try {
      setState(
        await api<DigState>(`/digs/${id}/next`, { method: "POST", json: { mode: m, distance: d } }),
      );
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || busy || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "k") void act({ action: "keep" });
      if (k === "p") void act({ action: "pass" });
      if (k === "l") void act({ action: "love" });
      if (k === "d") void openDig();
      if (k === "w") setSheet("wrong");
      if (k === "b" && state?.current?.node.parentId) void act({ action: "back" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const breadcrumb = useMemo(() => {
    if (!state?.current) return [] as TrailNode[];
    const byId = new Map(state.trail.map((n) => [n.id, n]));
    const out: TrailNode[] = [];
    let n: TrailNode | undefined = state.current.node;
    while (n) {
      out.unshift(n);
      n = n.parentId ? byId.get(n.parentId) : undefined;
    }
    return out;
  }, [state]);
  const nameOf = (n: TrailNode) => {
    const c = state?.trail && n;
    return c
      ? state?.session.seedCard && n.recordingId === state.session.seedCard.recording.id
        ? cardTitle(state.session.seedCard)
        : (n.explanation?.steps[n.explanation.steps.length - 1]?.toLabel ?? "…")
      : "…";
  };

  if (error)
    return (
      <Page title="Dig">
        <p className="muted">{error}</p>
        <Link href="/" className="btn mt-4">
          Back
        </Link>
      </Page>
    );
  if (!state)
    return (
      <Page>
        <CardSkeleton />
      </Page>
    );
  const cur = state.current;
  const isRoot = !cur?.node.parentId;

  return (
    <Page>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="btn btn-ghost -ml-3"
          onClick={() => router.push("/")}
          aria-label="Back to Dig home"
        >
          ← DIG.
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSheet("trail")}
          aria-label={`Open trail, ${state.trail.length} stops`}
          data-testid="trail-button"
        >
          Trail · {state.trail.length}{" "}
          {state.session.stats.branches > 1 ? `· ${state.session.stats.branches} forks` : ""}
        </button>
      </div>

      <nav aria-label="Breadcrumb" className="muted mb-3 flex flex-wrap items-center gap-1 text-xs">
        {breadcrumb.map((n, i) => (
          <span key={n.id} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            {i < breadcrumb.length - 1 ? (
              <button
                type="button"
                className="underline"
                onClick={() => act({ action: "jump", nodeId: n.id })}
              >
                {nameOf(n)}
              </button>
            ) : (
              <span className="font-medium" aria-current="location">
                {nameOf(n)}
              </span>
            )}
          </span>
        ))}
      </nav>

      {cur ? (
        <article
          aria-live="polite"
          data-testid="current-card"
          data-recording-id={cur.card.recording.id}
        >
          <RecordHero card={cur.card} />
          <div className="mt-3">
            <ExplanationChip explanation={cur.node.explanation} />
          </div>
          <div className="mt-4">
            <Player
              player={cur.player}
              title={cardTitle(cur.card)}
              onExternalOpen={() =>
                api(`/digs/${id}/action`, {
                  method: "POST",
                  json: { action: "jump", nodeId: cur.node.id, idempotencyKey: idempotencyKey() },
                }).catch(() => undefined)
              }
            />
          </div>
          {cur.card.sources.length > 1 && (
            <p className="muted mt-2 text-xs">
              {cur.card.sources.length} sources known.{" "}
              {cur.card.sources.filter((s) => s.playability === "unavailable").length > 0 &&
                "One is unavailable; showing the next legitimate option."}
            </p>
          )}

          {(note || state.nudge) && (
            <div
              role="status"
              className="card mt-4 flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p>{note?.text ?? state.nudge}</p>
                {note?.changed && note.changed.length > 0 && (
                  <ul className="muted mt-1 list-disc pl-4 text-xs">
                    {note.changed.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {state.lastGoodNodeId &&
                  state.lastGoodNodeId !== cur.node.id &&
                  (note?.text?.startsWith("Changed") || state.nudge) && (
                    <button
                      type="button"
                      className="btn mt-2"
                      onClick={() => act({ action: "jump", nodeId: state.lastGoodNodeId })}
                      data-testid="back-to-good"
                    >
                      Back to last good record
                    </button>
                  )}
              </div>
              <button
                type="button"
                className="btn btn-ghost min-h-[36px]"
                aria-label="Dismiss"
                onClick={() => setNote(null)}
              >
                ✕
              </button>
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="Main actions">
            <button
              type="button"
              className="btn"
              onClick={() => act({ action: "pass" })}
              disabled={busy}
              data-testid="pass"
            >
              Pass
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act({ action: "keep" })}
              disabled={busy}
              data-testid="keep"
            >
              Keep
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={openDig}
              disabled={busy}
              data-testid="dig-deeper"
            >
              Dig deeper
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="More actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => act({ action: "love" })}
              disabled={busy}
              data-testid="love"
            >
              ♥ Love
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSheet("wrong")}
              disabled={busy}
              data-testid="wrong-direction"
            >
              Wrong direction
            </button>
            <Link href={`/record/${cur.card.recording.id}?dig=${id}`} className="btn btn-ghost">
              More info
            </Link>
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => act({ action: "back" })}
              disabled={busy || isRoot}
              data-testid="back"
            >
              ← Back to the fork
            </button>
            <span className="muted self-center">
              Keys: K keep · P pass · D dig · W wrong · B back
            </span>
          </div>
        </article>
      ) : (
        <p className="muted">This dig has no current record.</p>
      )}

      <Sheet open={sheet === "dig"} onClose={() => setSheet(null)} title="Dig deeper">
        <fieldset className="mb-3">
          <legend className="mb-1 text-sm font-medium">Kind of connection</legend>
          <div className="grid grid-cols-2 gap-2">
            {DIG_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`btn flex-col items-start py-2 text-left ${m === mode ? "btn-primary" : ""}`}
                aria-pressed={m === mode}
                onClick={() => refreshSuggestions(m, distance)}
                data-testid={`mode-${m}`}
              >
                <span className="font-medium">{MODE_LABEL[m]}</span>
                <span className="text-[11px] opacity-80">{MODE_BLURB[m]}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mb-3">
          <legend className="mb-1 text-sm font-medium">Discovery distance</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIG_DISTANCES.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn flex-col py-2 ${d === distance ? "btn-primary" : ""}`}
                aria-pressed={d === distance}
                onClick={() => refreshSuggestions(mode, d)}
                title={DISTANCE_BLURB[d]}
              >
                {DISTANCE_LABEL[d]}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="btn btn-accent w-full"
          disabled={busy || state.suggestions.length === 0}
          onClick={async () => {
            setSheet(null);
            await act({ action: "dig_deeper", mode, distance });
          }}
          data-testid="dig-go"
        >
          {state.suggestions.length === 0
            ? "No strong links in this direction"
            : "Take the best branch →"}
        </button>
        <h3 className="mt-4 mb-1 text-sm font-medium">Or choose a branch</h3>
        {state.exhausted && (
          <p className="muted text-sm">
            No strong links left here. Jump back or try a different route.
          </p>
        )}
        <ul className="divide-y hairline">
          {state.suggestions.map((s) => (
            <li key={s.candidateId}>
              <RecordRow
                card={s.card}
                right={
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      setSheet(null);
                      await act({ action: "select", candidateId: s.candidateId });
                    }}
                    aria-label={`Go to ${cardTitle(s.card)}`}
                    data-testid="select-branch"
                  >
                    Go
                  </button>
                }
              />
              <p className="muted -mt-1 pb-2 text-xs">
                {s.explanation.headline}
                {s.explanation.steps.every((x) => x.confidence !== "inferred") ? "" : " · inferred"}
              </p>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === "wrong"} onClose={() => setSheet(null)} title="Wrong direction">
        <p className="muted mb-3 text-sm">
          Optional: why? This changes the current dig only. Your overall taste won&apos;t change.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              className="btn"
              onClick={async () => {
                setSheet(null);
                await act({ action: "wrong_direction", reasonCode: r.code });
              }}
              data-testid={`reason-${r.code}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-accent mt-3 w-full"
          onClick={async () => {
            setSheet(null);
            await act({ action: "wrong_direction" });
          }}
          data-testid="wrong-skip"
        >
          Just change course
        </button>
      </Sheet>

      <Sheet open={sheet === "trail"} onClose={() => setSheet(null)} title="Trail">
        <p className="muted mb-2 text-xs">
          Every stop on this dig. Tap one to go back there; fork it to start a new dig from that
          point.
        </p>
        <ol className="divide-y hairline">
          {state.trail.map((n) => (
            <li
              key={n.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
              style={{ paddingLeft: `${Math.min(n.depth, 6) * 12}px` }}
            >
              <button
                type="button"
                className={`text-left ${n.id === cur?.node.id ? "font-semibold" : ""}`}
                onClick={() => {
                  setSheet(null);
                  void act({ action: "jump", nodeId: n.id });
                }}
              >
                {nameOf(n)}{" "}
                <span className="muted text-xs">
                  · {n.outcome.replace("_", " ")}
                  {n.explanation ? ` · ${n.explanation.headline}` : ""}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[36px] text-xs"
                onClick={async () => {
                  try {
                    const f = await api<DigState>(`/digs/${id}/fork`, {
                      method: "POST",
                      json: { fromNodeId: n.id, mode, distance },
                    });
                    router.push(`/dig/${f.session.id}`);
                  } catch {
                    toast.push({ text: "Couldn't fork" });
                  }
                }}
              >
                Fork
              </button>
            </li>
          ))}
        </ol>
      </Sheet>

      <Sheet
        open={sheet === "tutorial"}
        onClose={() => {
          setSheet(null);
          try {
            localStorage.setItem("dig:tutorial", "1");
          } catch {
            /* ignore */
          }
        }}
        title="How digging works"
      >
        <ul className="space-y-2 text-sm">
          <li>
            <strong>Keep</strong> saves the record to All Finds. <strong>Love</strong> saves it and,
            only if you opt in, nudges your stable taste.
          </li>
          <li>
            <strong>Dig deeper</strong> picks the kind of connection to follow and how far to roam.
          </li>
          <li>
            <strong>Wrong direction</strong> changes this dig only, and offers the way back to your
            last good record.
          </li>
          <li>
            <strong>Back</strong> returns to the previous fork. Every stop stays in History so you
            can resume later.
          </li>
        </ul>
        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={() => {
            setSheet(null);
            try {
              localStorage.setItem("dig:tutorial", "1");
            } catch {
              /* ignore */
            }
          }}
          data-testid="tutorial-done"
        >
          Got it
        </button>
      </Sheet>
    </Page>
  );
}
