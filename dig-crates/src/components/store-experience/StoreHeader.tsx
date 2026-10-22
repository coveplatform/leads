"use client";

import { useBrowse } from "./BrowseContext";
import { IconBack, IconClose, IconHome, IconPile } from "./Icons";

/** Sticky branded top bar: Back/Close, store identity, crates home, pile. */
export function StoreHeader() {
  const { state, dispatch, store, presentationMode, requestClose, framed, backHref } = useBrowse();
  const pileCount = state.pile.length;

  const backControl = (() => {
    if (presentationMode === "overlay") {
      return (
        <button type="button" className="dig-btn dig-btn-ghost" onClick={requestClose} data-testid="dig-close" aria-label={`Close and return to ${store.name}`}>
          <IconClose />
          <span className="hidden sm:inline">Back to {store.name}</span>
        </button>
      );
    }
    if (presentationMode === "standalone" && !framed) {
      return (
        <a className="dig-btn dig-btn-ghost" href={backHref} data-testid="dig-back-to-shop">
          <IconBack />
          <span className="hidden sm:inline">Back to {store.name}</span>
        </a>
      );
    }
    return null;
  })();

  return (
    <header className="dig-header" data-testid="dig-header">
      {backControl}
      <div className="dig-header-brand">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- store-supplied SVG logo
          <img src={store.logoUrl} alt="" width={160} height={40} />
        ) : null}
        <span className={store.logoUrl ? "sr-only" : "dig-header-name"} data-testid="dig-store-name">
          <span className="sr-only">Record crates at </span>
          {store.name}
        </span>
      </div>
      {state.crateId !== null ? (
        <button type="button" className="dig-btn dig-btn-ghost" onClick={() => dispatch({ type: "GO_HOME" })} data-testid="dig-home">
          <IconHome />
          <span className="hidden sm:inline">Crates</span>
        </button>
      ) : null}
      <button
        type="button"
        className="dig-btn dig-btn-outline"
        style={{ position: "relative" }}
        onClick={() => dispatch({ type: "OPEN_PILE" })}
        aria-label={`Open pile, ${pileCount} ${pileCount === 1 ? "record" : "records"} saved`}
        data-testid="dig-pile-button"
      >
        <IconPile />
        <span className="hidden sm:inline">Pile</span>
        <span className="dig-badge-count" aria-hidden="true" data-testid="dig-pile-count">{pileCount}</span>
      </button>
    </header>
  );
}
