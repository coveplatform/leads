import type { RecommendationExplanation } from "@/domain/types";
import { relationLabel } from "@/lib/client/format";

const CONF_LABEL = {
  verified: "verified",
  curated: "editor-curated",
  inferred: "inferred",
} as const;

export function ExplanationChip({
  explanation,
  expanded = false,
}: {
  explanation: RecommendationExplanation | null;
  expanded?: boolean;
}) {
  if (!explanation)
    return <span className="chip chip-accent">Your seed: where this dig started</span>;
  return (
    <details className="group" open={expanded}>
      <summary
        className="chip chip-accent cursor-pointer list-none"
        aria-label={`Why this record: ${explanation.headline}`}
      >
        <span>Because: {explanation.headline}</span>
        <span aria-hidden className="muted">
          ▾
        </span>
      </summary>
      <ol className="mt-2 space-y-1 text-xs">
        {explanation.steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1">
            <span className="font-medium">{s.fromLabel}</span>
            <span className="muted">→ {relationLabel(s.relation)} →</span>
            <span className="font-medium">{s.toLabel}</span>
            <span className={`chip ${s.confidence === "inferred" ? "" : "chip-accent"}`}>
              {CONF_LABEL[s.confidence]}
            </span>
          </li>
        ))}
        <li className="muted">
          Mode: {explanation.mode.replace("_", " & ")} · distance: {explanation.distance} · band:{" "}
          {explanation.band}
          {explanation.isWildcard ? " · wildcard" : ""}
        </li>
      </ol>
    </details>
  );
}
