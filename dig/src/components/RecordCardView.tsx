import Link from "next/link";
import type { RecordCard } from "@/domain/types";
import { cardMeta, cardTitle } from "@/lib/client/format";
import { Sleeve } from "./Sleeve";

export function SourceBadge({ card }: { card: RecordCard }) {
  const s = card.source;
  if (!s) return <span className="chip">No source</span>;
  const label = s.provider === "demo" ? "Sample · search link" : s.provider;
  const play =
    s.playability === "embeddable"
      ? "plays here"
      : s.playability === "external_only"
        ? "opens on source"
        : s.playability === "unavailable"
          ? "unavailable"
          : "unknown";
  return (
    <span className="chip capitalize" title={s.attribution ?? undefined}>
      {label} · {play}
    </span>
  );
}

export function RecordRow({
  card,
  right,
  href,
}: {
  card: RecordCard;
  right?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div className="flex min-w-0 items-center gap-3">
      <Sleeve card={card} size="sm" />
      <div className="min-w-0">
        <div className="truncate font-medium">{cardTitle(card)}</div>
        <div className="muted truncate text-sm">
          {card.artist?.name ?? "Unknown artist"}
          {cardMeta(card) ? ` · ${cardMeta(card)}` : ""}
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 rounded-md">
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {right}
    </div>
  );
}

export function RecordHero({ card }: { card: RecordCard }) {
  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-start">
      <Sleeve card={card} size="lg" className="mx-auto max-w-[280px] md:max-w-none" />
      <div>
        <h1 className="font-serif text-2xl leading-tight md:text-3xl">{cardTitle(card)}</h1>
        <p className="mt-1 text-lg">{card.artist?.name ?? "Unknown artist"}</p>
        {card.credits.length > 0 && (
          <p className="muted text-sm">
            {card.credits.map((c) => `${c.role}: ${c.artist.name}`).join(" · ")}
          </p>
        )}
        <p className="muted mt-1 text-sm">{cardMeta(card) || "Release details unknown"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SourceBadge card={card} />
          {card.recording.isDemo && (
            <span className="chip" title="Editor-entered sample metadata; not licensed data">
              sample data
            </span>
          )}
          {card.recording.metadataConfidence < 0.5 && <span className="chip">sparse metadata</span>}
          {card.tags.slice(0, 4).map((t) => (
            <Link key={t.id} href={`/search?tag=${encodeURIComponent(t.slug)}`} className="chip">
              {t.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
