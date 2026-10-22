"use client";

import { useBrowse } from "./BrowseContext";
import type { RecordItem } from "@/domain/types";
import { IconCheck, IconDig, IconInfo, IconPlus } from "./Icons";

interface PileButtonProps {
  record: RecordItem;
  className?: string;
  compact?: boolean;
}

/** Add/remove a record from the pile. State is shown with an icon and text, not colour alone. */
export function PileButton({ record, className = "", compact = false }: PileButtonProps) {
  const { state, dispatch } = useBrowse();
  const saved = state.pile.includes(record.id);
  return (
    <button
      type="button"
      className={`dig-btn ${saved ? "" : "dig-btn-primary"} ${compact ? "dig-btn-sm" : ""} ${className}`.trim()}
      aria-pressed={saved}
      onClick={() => dispatch({ type: "TOGGLE_PILE", recordId: record.id })}
      data-testid={`pile-toggle-${record.id}`}
      aria-label={saved ? `Remove ${record.title} from pile` : `Add ${record.title} to pile`}
    >
      {saved ? <IconCheck size={18} /> : <IconPlus size={18} />}
      <span>{saved ? "In pile" : compact ? "Save" : "Add to pile"}</span>
    </button>
  );
}

export function DigAroundButton({ record, className = "", compact = false }: PileButtonProps) {
  const { dispatch } = useBrowse();
  return (
    <button
      type="button"
      className={`dig-btn ${compact ? "dig-btn-sm" : ""} ${className}`.trim()}
      onClick={() => dispatch({ type: "OPEN_RELATED", recordId: record.id })}
      data-testid={`dig-around-${record.id}`}
    >
      <IconDig size={18} />
      <span>Dig Around This</span>
    </button>
  );
}

export function DetailsButton({ record, className = "", compact = false }: PileButtonProps) {
  const { dispatch } = useBrowse();
  return (
    <button
      type="button"
      className={`dig-btn dig-btn-outline ${compact ? "dig-btn-sm" : ""} ${className}`.trim()}
      onClick={() => dispatch({ type: "OPEN_RECORD_DETAILS", recordId: record.id })}
      data-testid={`details-${record.id}`}
    >
      <IconInfo size={18} />
      <span>View details</span>
    </button>
  );
}

export function RecordFlags({ record, inPile }: { record: RecordItem; inPile?: boolean }) {
  return (
    <>
      {record.stockStatus === "sold" ? <span className="dig-badge">Sold out</span> : null}
      {record.newArrival ? <span className="dig-badge dig-badge-accent">New</span> : null}
      {record.staffPick ? <span className="dig-badge">Staff pick</span> : null}
      {!record.preview ? <span className="dig-badge">No preview</span> : null}
      {inPile ? <span className="dig-badge"><IconCheck size={12} /> In pile</span> : null}
    </>
  );
}
