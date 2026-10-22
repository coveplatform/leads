"use client";

import { useMemo, useState, type FormEvent } from "react";
import { countForCrate, matchesCrate } from "@/domain/catalog";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { IconSearch } from "./Icons";

/** Landing screen: search, crate tiles with montages and counts, jump-back-in card. */
export function CratesHome() {
  const { state, dispatch, catalog, crates, store, recordById } = useBrowse();
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of crates) map.set(c.id, countForCrate(catalog.snapshot.records, c));
    return map;
  }, [crates, catalog]);

  // Montage: the crate's configured cover ids when they belong to the crate and have artwork,
  // topped up with the crate's own records so every tile looks like its contents.
  const montages = useMemo(() => {
    const map = new Map<string, typeof catalog.snapshot.records>();
    for (const c of crates) {
      const picked = c.coverRecordIds.map((id) => catalog.byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r && !!r.artworkUrl && matchesCrate(r, c));
      if (picked.length < 4) {
        for (const r of catalog.snapshot.records) {
          if (picked.length >= 4) break;
          if (r.artworkUrl && matchesCrate(r, c) && !picked.includes(r)) picked.push(r);
        }
      }
      map.set(c.id, picked.slice(0, 4));
    }
    return map;
  }, [crates, catalog]);

  const resumeCrateId = useMemo(() => {
    const saved = Object.keys(state.cratePositions).find((id) => catalog.crateById.has(id));
    return saved ?? null;
  }, [state.cratePositions, catalog]);
  const resumeCrate = resumeCrateId ? catalog.crateById.get(resumeCrateId) : null;
  const resumeRecord = resumeCrateId ? recordById(state.cratePositions[resumeCrateId]) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    dispatch({ type: "SEARCH", query: q, viewMode: "wall" });
  };

  return (
    <div className="dig-scroll" data-testid="dig-home-screen">
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 12px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="dig-display" style={{ margin: 0, fontSize: "clamp(1.7rem, 4vw, 2.6rem)" }}>Dig through our crates</h1>
          <p className="dig-muted" style={{ margin: 0, maxWidth: 560 }}>{store.headline} Pick a crate to flip through one record at a time, or search the whole shop.</p>
          <form onSubmit={submit} role="search" style={{ display: "flex", gap: 8, maxWidth: 560 }}>
            <label className="sr-only" htmlFor="dig-home-search">Search the catalogue</label>
            <input
              id="dig-home-search"
              className="dig-input"
              type="search"
              placeholder="Artist, title, label, genre…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              data-testid="dig-home-search"
            />
            <button type="submit" className="dig-btn dig-btn-primary" aria-label="Search">
              <IconSearch />
              <span className="hidden sm:inline">Search</span>
            </button>
          </form>
        </section>

        {resumeCrate && resumeRecord && state.hydrated ? (
          <section className="dig-card" style={{ padding: 12, display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center" }} data-testid="dig-resume-card">
            <Cover record={resumeRecord} />
            <div style={{ minWidth: 0 }}>
              <div className="dig-muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Jump back in</div>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumeCrate.name}</div>
              <div className="dig-muted" style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumeRecord.artist} – {resumeRecord.title}</div>
            </div>
            <button type="button" className="dig-btn dig-btn-primary" onClick={() => dispatch({ type: "SELECT_CRATE", crateId: resumeCrate.id })}>
              Resume
            </button>
          </section>
        ) : null}

        <section aria-labelledby="dig-crates-heading">
          <h2 id="dig-crates-heading" className="dig-display" style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Crates</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }} data-testid="dig-crate-grid">
            {crates.map((crate) => {
              const count = counts.get(crate.id) ?? 0;
              const montage = montages.get(crate.id) ?? [];
              return (
                <button
                  key={crate.id}
                  type="button"
                  className="dig-card dig-crate-tile"
                  onClick={() => dispatch({ type: "SELECT_CRATE", crateId: crate.id, viewMode: "crate" })}
                  data-testid={`dig-crate-${crate.id}`}
                  aria-label={`${crate.name}, ${count} ${count === 1 ? "record" : "records"}`}
                >
                  <div className="dig-montage" aria-hidden="true">
                    {montage.length ? montage.map((r) => <Cover key={r.id} record={r} showSoldOverlay={false} />) : <div className="dig-cover" />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crate.name}</div>
                    <div className="dig-muted" style={{ fontSize: "0.85rem" }}>{count} {count === 1 ? "record" : "records"}</div>
                    {crate.description ? <div className="dig-muted" style={{ fontSize: "0.8rem", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crate.description}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <p className="dig-muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Your pile: {state.pile.length} {state.pile.length === 1 ? "record" : "records"} ·{" "}
          <button type="button" className="dig-btn dig-btn-ghost dig-btn-sm" onClick={() => dispatch({ type: "OPEN_PILE" })} style={{ display: "inline-flex" }}>
            Open pile
          </button>
        </p>
      </div>
    </div>
  );
}
