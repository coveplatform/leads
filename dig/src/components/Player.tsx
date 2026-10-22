"use client";
import { useEffect, useState } from "react";
import type { PlayerConfig } from "@/domain/types";

/**
 * Source-aware player. Embeds load only after a tap (no autoplay, no audio on
 * open). Anything we cannot legitimately play shows an honest outbound action.
 */
export function Player({
  player,
  title,
  onExternalOpen,
}: {
  player: PlayerConfig | null;
  title: string;
  onExternalOpen?: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setArmed(false);
    setFailed(false);
  }, [player?.embedUrl, player?.externalUrl]);

  if (!player)
    return <div className="card p-4 text-sm muted">No source saved for this record yet.</div>;

  if (player.capability === "embed" && player.embedUrl && !failed) {
    return (
      <div className="card overflow-hidden">
        {armed ? (
          <iframe
            title={`${player.providerLabel} player: ${title}`}
            src={player.embedUrl}
            className="aspect-video w-full"
            allow="encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFailed(true)}
          />
        ) : (
          <button
            type="button"
            className="btn w-full justify-between rounded-none px-4 py-5 text-left"
            onClick={() => setArmed(true)}
            aria-label={`Load ${player.providerLabel} player for ${title}`}
          >
            <span>
              <span className="block font-medium">Listen on {player.providerLabel}</span>
              <span className="muted block text-xs">
                Tap to load the official player. Nothing plays until you press play.
              </span>
            </span>
            <span aria-hidden className="text-xl">
              ▶
            </span>
          </button>
        )}
        <div className="flex items-center justify-between gap-2 border-t hairline px-3 py-2 text-xs">
          <span className="muted">{player.note ?? `Official ${player.providerLabel} embed`}</span>
          <a
            className="underline"
            href={player.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onExternalOpen}
          >
            Open on {player.providerLabel}
          </a>
        </div>
      </div>
    );
  }

  if (player.capability === "none") {
    return (
      <div className="card p-4">
        <p className="text-sm font-medium">{player.note ?? "This source can't be played here."}</p>
        <a
          className="btn mt-3"
          href={player.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onExternalOpen}
        >
          Open original source
        </a>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <a
        className="btn btn-primary w-full"
        href={player.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onExternalOpen}
      >
        Listen on {player.providerLabel} ↗
      </a>
      {player.note && <p className="muted mt-2 text-xs">{player.note}</p>}
      {failed && (
        <p className="muted mt-2 text-xs">
          The embedded player failed to load, so here is the original source instead.
        </p>
      )}
    </div>
  );
}
