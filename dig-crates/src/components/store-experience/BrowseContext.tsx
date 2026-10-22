"use client";

import { createContext, useContext, type Dispatch } from "react";
import type { BrowseAction, BrowseCatalog, BrowseState } from "@/domain/browse-reducer";
import type { Crate, RecordItem, Store } from "@/domain/types";

export type PresentationMode = "standalone" | "overlay" | "inline";

export interface BrowseContextValue {
  state: BrowseState;
  dispatch: Dispatch<BrowseAction>;
  catalog: BrowseCatalog;
  store: Store;
  crates: Crate[];
  presentationMode: PresentationMode;
  /** Formats a minor-unit amount in the store's currency. */
  formatMinor: (minor: number) => string;
  /** Close the experience (overlay) or go back to the shop (standalone). */
  requestClose: () => void;
  /** Where "Back to shop" points when the app is not framed. */
  backHref: string;
  /** Whether the app is framed by a host page (overlay/inline). */
  framed: boolean;
  /** Notify the host (if any) that a demo product was requested. */
  notifyDemoProduct: (recordId: string) => void;
  recordById: (id: string | null | undefined) => RecordItem | null;
}

export const BrowseContext = createContext<BrowseContextValue | null>(null);

export function useBrowse(): BrowseContextValue {
  const ctx = useContext(BrowseContext);
  if (!ctx) throw new Error("useBrowse must be used within StoreExperience");
  return ctx;
}
