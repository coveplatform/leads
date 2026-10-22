"use client";

import { useState } from "react";
import type { RecordItem } from "@/domain/types";

interface CoverProps {
  record: RecordItem;
  /** Hero covers load eagerly; everything else is lazy. */
  priority?: boolean;
  className?: string;
  sizes?: string;
  showSoldOverlay?: boolean;
}

function initials(record: RecordItem): string {
  return record.artist
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Square record cover with a reserved 1:1 box, lazy loading and an honest "no cover" fallback. */
export function Cover({ record, priority = false, className = "", showSoldOverlay = true }: CoverProps) {
  // Track which record failed so a new record resets the state without an effect.
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === record.id;
  const sold = showSoldOverlay && record.stockStatus === "sold";
  const alt = `${record.artist} – ${record.title}${sold ? " (sold out)" : ""}`;
  const showImage = record.artworkUrl && !failed;
  return (
    <div className={`dig-cover ${sold ? "dig-cover-sold" : ""} ${className}`.trim()} data-record-cover={record.id}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- fixture SVGs; no optimisation pipeline needed
        <img
          src={record.artworkUrl ?? undefined}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          width={330}
          height={330}
          draggable={false}
          onError={() => setFailedId(record.id)}
        />
      ) : (
        <div className="dig-cover-fallback" role="img" aria-label={`${alt}. No cover image available.`}>
          <strong aria-hidden="true">{initials(record)}</strong>
          <span aria-hidden="true">{failed ? "Cover failed to load" : "No cover image"}</span>
        </div>
      )}
    </div>
  );
}
