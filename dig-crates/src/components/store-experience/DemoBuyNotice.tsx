"use client";

import { useState } from "react";
import { track } from "@/lib/analytics-demo";
import type { RecordItem } from "@/domain/types";
import { useBrowse } from "./BrowseContext";

/**
 * The "buy" affordance in this prototype never purchases anything. Clicking it reveals an
 * explanatory panel; in a live deployment it would hand off to the retailer's own product page.
 */
export function DemoBuyNotice({ record }: { record: RecordItem }) {
  const { store, notifyDemoProduct, formatMinor } = useBrowse();
  const [open, setOpen] = useState(false);
  const sold = record.stockStatus === "sold";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        className="dig-btn dig-btn-outline"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) {
            track("demo_buy_clicked", { storeSlug: store.slug, recordId: record.id });
            notifyDemoProduct(record.id);
          }
        }}
        aria-expanded={open}
        data-testid="demo-buy"
        disabled={sold}
      >
        {sold ? "Sold out" : `Demo buy · ${formatMinor(record.priceMinor)}`}
      </button>
      {open ? (
        <div className="dig-warning" role="note" data-testid="demo-buy-notice">
          <strong>Demo checkout: no purchase will be made.</strong>
          <p style={{ margin: "6px 0 0" }}>
            This is a fictional record in a prototype. In a live deployment this button would open {store.name}&rsquo;s own product
            page (for example <code>https://shop.example/products/{record.id}</code>) where the real checkout lives. Nothing is reserved or charged.
          </p>
          <button type="button" className="dig-btn dig-btn-sm" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Got it</button>
        </div>
      ) : null}
    </div>
  );
}
