"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { RecordHero, RecordRow } from "@/components/RecordCardView";
import { Player } from "@/components/Player";
import { CardSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import { relationLabel } from "@/lib/client/format";
import type { MusicSource, PlayerConfig, RecordCard } from "@/domain/types";
import type { DigState } from "@/features/discovery/service";

interface Detail {
  card: RecordCard;
  player: PlayerConfig | null;
  players: Array<{ source: MusicSource; player: PlayerConfig | null }>;
  neighbours: Array<{
    relation: string;
    provenance: string;
    weight: number;
    card: RecordCard | null;
  }>;
  curations: Array<{ slug: string; title: string }>;
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const dig = useSearchParams().get("dig");
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    api<Detail>(`/recordings/${id}`)
      .then(setD)
      .catch(() => setD(null));
  }, [id]);
  if (!d)
    return (
      <Page>
        <CardSkeleton />
      </Page>
    );
  const start = async () => {
    try {
      const s = await api<DigState>("/digs", {
        method: "POST",
        json: { seed: { type: "recording", id }, mode: "connections", distance: "explore" },
      });
      router.push(`/dig/${s.session.id}`);
    } catch {
      toast.push({ text: "Couldn't start" });
    }
  };
  return (
    <Page
      actions={
        dig ? (
          <Link href={`/dig/${dig}`} className="btn text-xs">
            ← Back to dig
          </Link>
        ) : undefined
      }
    >
      <RecordHero card={d.card} />
      <div className="mt-4 space-y-2">
        {d.players.map(({ source, player }) => (
          <Player key={source.id} player={player} title={d.card.recording.title} />
        ))}
        {d.players.length === 0 && <p className="muted text-sm">No sources yet.</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-accent" onClick={start}>
          Start a dig from here
        </button>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Connections ({d.neighbours.length})</h2>
        {d.neighbours.length === 0 && (
          <p className="muted text-sm">
            Not enough metadata to connect this record yet. Try search instead.
          </p>
        )}
        <ul className="divide-y hairline">
          {d.neighbours.slice(0, 30).map(
            (n, i) =>
              n.card && (
                <li key={i}>
                  <RecordRow
                    card={n.card}
                    href={`/record/${n.card.recording.id}${dig ? `?dig=${dig}` : ""}`}
                    right={
                      <span className="chip">
                        {relationLabel(n.relation)} ·{" "}
                        {n.provenance === "inferred" ? "inferred" : "curated"}
                      </span>
                    }
                  />
                </li>
              ),
          )}
        </ul>
      </section>
      {d.curations.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Editor routes</h2>
          <div className="flex flex-wrap gap-2">
            {d.curations.map((c) => (
              <span key={c.slug} className="chip">
                {c.title}
              </span>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
export default function RecordPage() {
  return (
    <Suspense
      fallback={
        <Page>
          <CardSkeleton />
        </Page>
      }
    >
      <Inner />
    </Suspense>
  );
}
