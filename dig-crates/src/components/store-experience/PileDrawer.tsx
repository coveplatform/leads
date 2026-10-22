"use client";

import { useState } from "react";
import { sumMinor } from "@/domain/pricing";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { IconCopy, IconTrash } from "./Icons";
import { ModalPanel } from "./ModalPanel";

/** The pile is a temporary shortlist, persisted per store. It is not a cart. */
export function PileDrawer() {
  const { state, dispatch, recordById, formatMinor, store } = useBrowse();
  const open = state.openedPanel === "pile";
  const records = state.pile.map((id) => recordById(id)).filter((r): r is NonNullable<typeof r> => !!r);
  const total = sumMinor(records.map((r) => r.priceMinor));
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState(false);
  const close = () => dispatch({ type: "CLOSE_PANEL" });

  const copyList = async () => {
    const text = [`${store.name} pile (demo shortlist, nothing reserved)`, ...records.map((r) => `${r.artist} – ${r.title} (${r.label}, ${r.releaseYear}) ${formatMinor(r.priceMinor)}`), `Indicative total: ${formatMinor(total)}`].join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied("done");
        return;
      }
      throw new Error("no clipboard");
    } catch {
      setCopied("failed");
    } finally {
      window.setTimeout(() => setCopied("idle"), 2500);
    }
  };

  return (
    <ModalPanel
      open={open}
      onClose={close}
      title={`Your pile (${records.length})`}
      testId="dig-pile"
      description="Saved records for this shop. This is a shortlist, not a checkout."
      footer={
        records.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span className="dig-muted" style={{ fontSize: "0.85rem" }}>Indicative demo total; no checkout</span>
              <strong className="dig-price" style={{ fontSize: "1.2rem" }} data-testid="dig-pile-total">{formatMinor(total)}</strong>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="dig-btn dig-btn-primary" onClick={() => setCheckoutNote((v) => !v)} aria-expanded={checkoutNote} data-testid="dig-pile-checkout">Demo checkout</button>
              <button type="button" className="dig-btn" onClick={copyList} data-testid="dig-pile-copy"><IconCopy size={18} /> {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy list"}</button>
              {confirmClear ? (
                <>
                  <button type="button" className="dig-btn dig-btn-outline" onClick={() => { dispatch({ type: "CLEAR_PILE" }); setConfirmClear(false); }} data-testid="dig-pile-clear-confirm">Yes, clear pile</button>
                  <button type="button" className="dig-btn dig-btn-ghost" onClick={() => setConfirmClear(false)}>Keep</button>
                </>
              ) : (
                <button type="button" className="dig-btn dig-btn-ghost" onClick={() => setConfirmClear(true)} data-testid="dig-pile-clear"><IconTrash size={18} /> Clear</button>
              )}
            </div>
            {checkoutNote ? (
              <div className="dig-warning" role="note" data-testid="dig-pile-checkout-notice">
                <strong>Demo only: no purchase will be made.</strong> A live deployment would hand this shortlist to {store.name}&rsquo;s own checkout. Nothing here reserves stock or takes payment.
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      {records.length === 0 ? (
        <div className="dig-empty" data-testid="dig-pile-empty">
          <h3 className="dig-display">Your pile is empty</h3>
          <p style={{ margin: 0 }}>Add records as you dig and they will wait here, even after a refresh.</p>
          <button type="button" className="dig-btn dig-btn-primary" onClick={close}>Keep digging</button>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }} data-testid="dig-pile-list">
          {records.map((r) => (
            <li key={r.id} className="dig-row" data-testid={`pile-row-${r.id}`}>
              <Cover record={r} />
              <div className="dig-row-text">
                <span className="t">{r.title}</span>
                <span className="a">{r.artist} · {r.label}</span>
                <span className="a">{formatMinor(r.priceMinor)} · Media {r.conditionMedia} · Sleeve {r.conditionSleeve}{r.stockStatus === "sold" ? " · Sold out" : ""}</span>
              </div>
              <div className="dig-row-actions">
                <button type="button" className="dig-btn dig-btn-sm dig-btn-ghost" onClick={() => dispatch({ type: "OPEN_RECORD_DETAILS", recordId: r.id })} aria-label={`View details for ${r.title}`}>Details</button>
                <button type="button" className="dig-btn dig-btn-sm dig-btn-ghost" onClick={() => dispatch({ type: "REMOVE_FROM_PILE", recordId: r.id })} aria-label={`Remove ${r.title} from pile`} data-testid={`pile-remove-${r.id}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModalPanel>
  );
}
