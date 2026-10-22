"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { buildBrowseCatalog, createBrowseReducer, initialBrowseState, toPersistedSession, type BrowseAction, type BrowseState } from "@/domain/browse-reducer";
import { filtersFromSearchParams, filtersToSearchParams, parseSortKey } from "@/domain/filters";
import { randomSeed } from "@/domain/hash";
import { formatPrice } from "@/domain/pricing";
import { VIEW_MODES, type CatalogSnapshot, type RecordItem, type ThemeTokens, type ViewMode } from "@/domain/types";
import { track } from "@/lib/analytics-demo";
import { audioController, useAudioState } from "@/lib/audio-controller";
import { buildChildMessage, isAllowedParentOrigin, normaliseOrigin, validateInboundParentMessage } from "@/lib/embed-messages";
import { loadOrCreateSortSeed, loadPile, loadSession, savePile, saveSession } from "@/lib/persisted-state";
import { mergeThemeOverride, themeClassNames, themeToCssVars } from "@/lib/store-theme";
import { BrowseContext, type BrowseContextValue, type PresentationMode } from "./BrowseContext";
import { CratesHome } from "./CratesHome";
import { CrateViewer } from "./CrateViewer";
import { FilterPanel } from "./FilterPanel";
import { ListeningViewer } from "./ListeningViewer";
import { Notice } from "./Notice";
import { PileDrawer } from "./PileDrawer";
import { RecordDetail } from "./RecordDetail";
import { RelatedDrawer } from "./RelatedDrawer";
import { StoreHeader } from "./StoreHeader";
import { Toolbar } from "./Toolbar";
import { WallViewer } from "./WallViewer";

export interface StoreExperienceProps {
  catalog: CatalogSnapshot;
  presentationMode: PresentationMode;
  /** Validated partial theme override (theme lab / `?theme=` param). */
  themeOverride?: Partial<ThemeTokens> | null;
  /** Origin of the host page, from the launcher's `parentOrigin` query param. */
  parentOrigin?: string | null;
  /** Whether localhost parents are accepted (development). */
  allowLocalhost?: boolean;
  /** Initial deep-link state from the URL (standalone only). */
  initialUrl?: { crate?: string | null; view?: string | null; record?: string | null; q?: string | null; search?: string | null };
  /** Where "Back to shop" points when not framed. */
  backHref?: string;
  /** Disable persistence (theme lab preview). */
  ephemeral?: boolean;
}

const noopSubscribe = () => () => {};

function initialStateFor(slug: string): BrowseState {
  // Seed is created on the client in an effect; placeholder keeps SSR deterministic.
  return initialBrowseState(slug, "ssr-seed");
}

/** The single shared DIG engine. Every host, theme and presentation mode renders this component. */
export function StoreExperience({ catalog: snapshot, presentationMode, themeOverride, parentOrigin, allowLocalhost = false, initialUrl, backHref, ephemeral = false }: StoreExperienceProps) {
  const catalog = useMemo(() => buildBrowseCatalog(snapshot), [snapshot]);
  const reducer = useMemo(() => createBrowseReducer(catalog), [catalog]);
  const [state, dispatch] = useReducer(reducer, snapshot.store.slug, initialStateFor);
  const store = snapshot.store;
  const { theme, rejectedKeys } = useMemo(() => mergeThemeOverride(store.theme, themeOverride ?? null), [store.theme, themeOverride]);
  const rootRef = useRef<HTMLDivElement>(null);
  const audio = useAudioState();
  const framed = useSyncExternalStore(noopSubscribe, () => window.parent !== window, () => false);

  // Host origin for postMessage: only when framed and the parent origin is allowed for this store.
  const hostOrigin = useMemo(() => {
    if (presentationMode === "standalone" || !framed) return null;
    const candidate = normaliseOrigin(parentOrigin);
    if (!candidate) return null;
    const policy = { allowedEmbedOrigins: store.allowedEmbedOrigins, selfOrigin: window.location.origin, allowLocalhost };
    return isAllowedParentOrigin(candidate, policy) ? candidate : null;
  }, [presentationMode, framed, parentOrigin, store.allowedEmbedOrigins, allowLocalhost]);

  // --- Hydration: URL deep link wins over the saved session; everything is validated. ---
  useEffect(() => {
    const seed = loadOrCreateSortSeed(randomSeed);
    const session = ephemeral ? null : loadSession(store.slug);
    const pile = ephemeral ? [] : loadPile(store.slug);
    const url = initialUrl;
    const hasUrlState = !!(url?.crate || url?.record || url?.q || url?.search);
    if (hasUrlState) {
      const crateId = url?.crate && catalog.crateById.has(url.crate) ? url.crate : catalog.allCrateId;
      const view = url?.view && (VIEW_MODES as readonly string[]).includes(url.view) ? (url.view as ViewMode) : "crate";
      const params = new URLSearchParams(url?.search ?? "");
      dispatch({
        type: "RESTORE_SESSION",
        pile,
        sortSeed: seed,
        session: {
          version: 1,
          crateId,
          viewMode: view,
          query: (url?.q ?? "").slice(0, 120),
          filters: filtersFromSearchParams(params),
          sort: parseSortKey(params.get("sort")),
          focusedRecordId: url?.record ?? null,
          cratePositions: session?.cratePositions ?? {},
          savedAt: new Date().toISOString(),
        },
      });
    } else {
      // Resume the pile and remembered positions, but start on the crates landing screen.
      dispatch({ type: "RESTORE_SESSION", pile, sortSeed: seed, session: session ? { ...session, crateId: null, query: "", focusedRecordId: null } : null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per store
  }, [store.slug]);

  // --- Persistence (never audio state). ---
  useEffect(() => {
    if (!state.hydrated || ephemeral) return;
    savePile(store.slug, state.pile);
  }, [state.pile, state.hydrated, store.slug, ephemeral]);

  useEffect(() => {
    if (!state.hydrated || ephemeral) return;
    const t = window.setTimeout(() => saveSession(store.slug, toPersistedSession(state)), 150);
    return () => window.clearTimeout(t);
  }, [state, store.slug, ephemeral]);

  // --- URL sync for standalone deep links (replaceState only; never inside an iframe). ---
  useEffect(() => {
    if (presentationMode !== "standalone" || !state.hydrated || framed) return;
    const params = filtersToSearchParams(state.filters, new URLSearchParams());
    if (state.crateId) params.set("crate", state.crateId); else params.delete("crate");
    if (state.crateId) params.set("view", state.viewMode);
    if (state.focusedRecordId && state.crateId) params.set("record", state.focusedRecordId);
    if (state.query) params.set("q", state.query);
    if (state.sort !== "recent") params.set("sort", state.sort);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [presentationMode, framed, state.hydrated, state.crateId, state.viewMode, state.focusedRecordId, state.query, state.sort, state.filters]);

  // --- Audio safety: navigating away from a record or changing mode stops the old preview. ---
  useEffect(() => {
    audioController.stopIfNot(state.focusedRecordId);
  }, [state.focusedRecordId]);
  useEffect(() => {
    audioController.stop();
  }, [state.viewMode, state.crateId]);
  useEffect(() => () => audioController.destroy(), []);

  // --- Analytics (demo). ---
  const prevRef = useRef<BrowseState | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!prev || !state.hydrated) return;
    const slug = store.slug;
    if (state.crateId && state.crateId !== prev.crateId) track("crate_opened", { storeSlug: slug, crateId: state.crateId });
    if (state.viewMode !== prev.viewMode) track("view_mode_changed", { storeSlug: slug, from: prev.viewMode, to: state.viewMode });
    if (state.focusedRecordId && state.focusedRecordId !== prev.focusedRecordId) track("record_viewed", { storeSlug: slug, recordId: state.focusedRecordId, mode: state.viewMode });
    if (state.query !== prev.query && state.query) track("search_performed", { storeSlug: slug, resultCount: state.orderedRecordIds.length });
    if (state.filters !== prev.filters) {
      const keys = Object.entries(state.filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false)).map(([k]) => k);
      if (keys.length) track("filters_applied", { storeSlug: slug, keys });
    }
    const added = state.pile.filter((id) => !prev.pile.includes(id));
    const removed = prev.pile.filter((id) => !state.pile.includes(id));
    for (const id of added) track("record_saved", { storeSlug: slug, recordId: id });
    for (const id of removed) track("record_unsaved", { storeSlug: slug, recordId: id });
  }, [state, store.slug]);

  // --- Embed bridge: strict origin + source validation both ways. ---
  const postToHost = useCallback(
    (message: ReturnType<typeof buildChildMessage>) => {
      if (!hostOrigin || !framed) return false;
      window.parent.postMessage(message, hostOrigin);
      return true;
    },
    [hostOrigin, framed],
  );

  useEffect(() => {
    if (presentationMode !== "standalone" && framed && parentOrigin && !hostOrigin) {
      console.warn("[dig-crates] parent origin is not allowed for this store; host messaging disabled", parentOrigin);
    }
  }, [presentationMode, framed, parentOrigin, hostOrigin]);

  useEffect(() => {
    if (!hostOrigin || !framed) return;
    window.parent.postMessage(buildChildMessage("READY", store.slug, {}), hostOrigin);
    const onMessage = (event: MessageEvent) => {
      const message = validateInboundParentMessage(event, hostOrigin, window.parent, store.slug);
      if (!message) {
        if (process.env.NODE_ENV === "development" && event.origin !== window.location.origin) console.debug("[dig-crates] ignored message", event.origin);
        return;
      }
      if (message.type === "FOCUS") {
        const first = rootRef.current?.querySelector<HTMLElement>("[data-testid='dig-close'], button, [href], input");
        first?.focus();
      } else if (message.type === "HOST_CLOSING") {
        audioController.stop();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hostOrigin, framed, store.slug]);

  // Inline mode: ask the host for more height when content needs it (bounded, grow-only).
  useEffect(() => {
    if (presentationMode !== "inline" || !hostOrigin) return;
    let last = 0;
    const report = () => {
      const needed = Math.ceil(document.documentElement.scrollHeight);
      if (needed > window.innerHeight + 8 && Math.abs(needed - last) > 8 && needed >= 200 && needed <= 4000) {
        last = needed;
        postToHost(buildChildMessage("RESIZE", store.slug, { height: needed }));
      }
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(report) : null;
    if (rootRef.current) ro?.observe(rootRef.current);
    report();
    return () => ro?.disconnect();
  }, [presentationMode, hostOrigin, postToHost, store.slug]);

  const requestClose = useCallback(() => {
    audioController.stop();
    track("experience_closed", { storeSlug: store.slug });
    if (presentationMode === "overlay" && postToHost(buildChildMessage("REQUEST_CLOSE", store.slug, {}))) return;
    // Fallback when not framed or messaging is unavailable: go back to the shop page.
    window.location.assign(backHref ?? `/demo/hosts/${store.slug}`);
  }, [presentationMode, postToHost, store.slug, backHref]);

  // Escape with no panel open closes the overlay (panels handle their own Escape).
  useEffect(() => {
    if (presentationMode !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.openedPanel === "none") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentationMode, state.openedPanel, requestClose]);

  const notifyDemoProduct = useCallback(
    (recordId: string) => {
      postToHost(buildChildMessage("OPEN_DEMO_PRODUCT", store.slug, { recordId }));
    },
    [postToHost, store.slug],
  );

  const formatMinor = useCallback((minor: number) => formatPrice(minor, store.currency), [store.currency]);
  const recordById = useCallback((id: string | null | undefined): RecordItem | null => (id ? (catalog.byId.get(id) ?? null) : null), [catalog]);

  const value: BrowseContextValue = useMemo(
    () => ({
      state,
      dispatch: dispatch as React.Dispatch<BrowseAction>,
      catalog,
      store,
      crates: snapshot.crates,
      presentationMode,
      formatMinor,
      requestClose,
      backHref: backHref ?? `/demo/hosts/${store.slug}`,
      framed,
      notifyDemoProduct,
      recordById,
    }),
    [state, catalog, store, snapshot.crates, presentationMode, formatMinor, requestClose, backHref, framed, notifyDemoProduct, recordById],
  );

  return (
    <BrowseContext.Provider value={value}>
      <div ref={rootRef} className={themeClassNames(theme)} style={themeToCssVars(theme)} data-presentation={presentationMode} data-store={store.slug} data-testid="dig-root" data-hydrated={state.hydrated ? "true" : "false"} data-audio-status={audio.status} data-audio-record={audio.recordId ?? ""}>
        <StoreHeader />
        <main className="dig-main" aria-label={`${store.name} record crates`}>
          {rejectedKeys.length ? <p className="dig-warning" style={{ margin: 8 }}>Some theme overrides were invalid and ignored: {rejectedKeys.join(", ")}.</p> : null}
          {state.crateId === null ? (
            <CratesHome />
          ) : (
            <>
              <Toolbar />
              {state.viewMode === "crate" ? <CrateViewer /> : state.viewMode === "wall" ? <WallViewer /> : <ListeningViewer />}
            </>
          )}
          <Notice />
        </main>
        <footer className="dig-footnote">
          <span>Fictional demo shop and releases. Demo audio is synthetic test sound, not the record.</span>
          <span>Browsing by DIG Crates</span>
        </footer>
        <RecordDetail />
        <PileDrawer />
        <FilterPanel />
        <RelatedDrawer />
      </div>
    </BrowseContext.Provider>
  );
}
