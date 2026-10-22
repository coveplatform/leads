import { describe, expect, it } from "vitest";
import { formatPrice, parseMajorToMinor, sumMinor } from "@/domain/pricing";
import { filterChips, filtersFromSearchParams, filtersToSearchParams, parseSortKey } from "@/domain/filters";
import { EMPTY_FILTERS } from "@/domain/types";
import { loadPile, loadSession, parsePile, parseSession, savePile, saveSession, pileKey } from "@/lib/persisted-state";
import { buildChildMessage, isAllowedParentOrigin, normaliseOrigin, parseChildMessage, validateInboundParentMessage } from "@/lib/embed-messages";
import { contrastRatio, decodeThemeParam, encodeThemeParam, mergeThemeOverride, themeContrastChecks, themeIsAccessible, themeToCssVars } from "@/lib/store-theme";
import { clearEvents, getEvents, summariseEvents, track } from "@/lib/analytics-demo";
import { theme } from "./helpers";

describe("pricing", () => {
  it("formats minor units in the right currency and never uses floating dollars", () => {
    expect(formatPrice(3800, "AUD")).toBe("$38.00");
    expect(formatPrice(3800, "GBP")).toBe("£38.00");
    expect(formatPrice(1999, "USD")).toBe("$19.99");
    expect(formatPrice(Number.NaN, "AUD")).toBe("—");
    expect(sumMinor([1000, 2550, 0.4])).toBe(3550);
    expect(parseMajorToMinor("29.50")).toBe(2950);
    expect(parseMajorToMinor("$30")).toBe(3000);
    expect(parseMajorToMinor("")).toBeUndefined();
    expect(parseMajorToMinor("abc")).toBeUndefined();
  });
});

describe("filters round-trip", () => {
  it("serialises to and from URL params, dropping invalid values", () => {
    const f = { ...EMPTY_FILTERS, genre: ["House", "Techno"], formats: ["LP" as const], yearFrom: 1990, previewOnly: true };
    const params = filtersToSearchParams(f);
    expect(filtersFromSearchParams(params)).toEqual(f);
    const bad = filtersFromSearchParams(new URLSearchParams("format=LP,Cassette&condition=NM,ZZ&yearFrom=abc"));
    expect(bad.formats).toEqual(["LP"]);
    expect(bad.condition).toEqual(["NM"]);
    expect(bad.yearFrom).toBeUndefined();
    expect(parseSortKey("price-asc")).toBe("price-asc");
    expect(parseSortKey("evil")).toBe("recent");
  });
  it("builds removable chips", () => {
    const f = { ...EMPTY_FILTERS, genre: ["House"], priceMaxMinor: 3000 };
    const chips = filterChips(f, (m) => `$${m / 100}`);
    expect(chips.map((c) => c.label)).toEqual(["House", "Under $30"]);
    expect(chips[0]!.remove(f).genre).toEqual([]);
  });
});

describe("persisted state", () => {
  it("scopes piles per store and tolerates malformed data", () => {
    savePile("basement-wax", ["a", "b", "a"]);
    savePile("sunday-records", ["c"]);
    expect(loadPile("basement-wax")).toEqual(["a", "b"]);
    expect(loadPile("sunday-records")).toEqual(["c"]);
    expect(loadPile("signal-records")).toEqual([]);
    window.localStorage.setItem(pileKey("basement-wax"), "{not json");
    expect(loadPile("basement-wax")).toEqual([]);
    expect(parsePile({ version: 2, recordIds: ["x"] })).toEqual([]);
    expect(parsePile({ version: 1, recordIds: [1, 2] })).toEqual([]);
    expect(loadPile("../evil")).toEqual([]);
  });
  it("validates sessions", () => {
    expect(parseSession({ version: 1, crateId: "c", viewMode: "disco", query: "", filters: EMPTY_FILTERS, sort: "recent", focusedRecordId: null, cratePositions: {}, savedAt: "" })).toBeNull();
    saveSession("basement-wax", { version: 1, crateId: "c", viewMode: "wall", query: "q", filters: EMPTY_FILTERS, sort: "recent", focusedRecordId: "r", cratePositions: {}, savedAt: "2026-01-01" });
    expect(loadSession("basement-wax")?.viewMode).toBe("wall");
    expect(loadSession("other")).toBeNull();
  });
});

describe("embed messages", () => {
  it("builds and parses well-formed child messages only", () => {
    const m = buildChildMessage("RESIZE", "basement-wax", { height: 800 });
    expect(parseChildMessage(m)).toEqual(m);
    expect(parseChildMessage({ ...m, height: 99999 })).toBeNull();
    expect(parseChildMessage({ ...m, namespace: "other" })).toBeNull();
    expect(parseChildMessage({ ...m, version: 2 })).toBeNull();
    expect(parseChildMessage("READY")).toBeNull();
    expect(parseChildMessage({ ...buildChildMessage("OPEN_DEMO_PRODUCT", "x", { recordId: "<script>" }) })).toBeNull();
  });
  it("enforces origin policy", () => {
    const policy = { allowedEmbedOrigins: ["https://shop.example"], selfOrigin: "https://dig.example", allowLocalhost: false };
    expect(isAllowedParentOrigin("https://shop.example", policy)).toBe(true);
    expect(isAllowedParentOrigin("https://dig.example", policy)).toBe(true);
    expect(isAllowedParentOrigin("https://evil.example", policy)).toBe(false);
    expect(isAllowedParentOrigin("http://localhost:3000", policy)).toBe(false);
    expect(isAllowedParentOrigin("http://localhost:3000", { ...policy, allowLocalhost: true })).toBe(true);
    expect(isAllowedParentOrigin("null", policy)).toBe(false);
    expect(normaliseOrigin("https://shop.example/path")).toBeNull();
    expect(normaliseOrigin("javascript:alert(1)")).toBeNull();
    expect(normaliseOrigin("https://Shop.example")).toBe("https://shop.example");
  });
  it("rejects inbound messages from the wrong origin, window or store", () => {
    const parent = {};
    const msg = { namespace: "dig-crates", version: 1, type: "FOCUS", storeSlug: "basement-wax" };
    expect(validateInboundParentMessage({ data: msg, origin: "https://shop.example", source: parent }, "https://shop.example", parent, "basement-wax")?.type).toBe("FOCUS");
    expect(validateInboundParentMessage({ data: msg, origin: "https://evil.example", source: parent }, "https://shop.example", parent, "basement-wax")).toBeNull();
    expect(validateInboundParentMessage({ data: msg, origin: "https://shop.example", source: {} }, "https://shop.example", parent, "basement-wax")).toBeNull();
    expect(validateInboundParentMessage({ data: msg, origin: "https://shop.example", source: parent }, "https://shop.example", parent, "other")).toBeNull();
    expect(validateInboundParentMessage({ data: msg, origin: "https://shop.example", source: parent }, null, parent, "basement-wax")).toBeNull();
  });
});

describe("store theme", () => {
  it("maps tokens to scoped CSS variables", () => {
    const vars = themeToCssVars(theme) as Record<string, string>;
    expect(vars["--dig-accent"]).toBe("#d29a68");
    expect(vars["--dig-radius-button"]).toBe("8px");
    expect(vars["--dig-shadow"]).not.toBe("none");
  });
  it("computes WCAG contrast and flags inaccessible themes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(themeIsAccessible(theme)).toBe(true);
    expect(themeIsAccessible({ ...theme, foreground: "#2a2a2a" })).toBe(false);
    expect(themeContrastChecks(theme).length).toBeGreaterThan(5);
  });
  it("rejects invalid overrides field by field and never accepts CSS injection", () => {
    const { theme: merged, rejectedKeys } = mergeThemeOverride(theme, { accent: "#123456", fontBody: "Arial; } body { display:none }", buttonRadius: 999 });
    expect(merged.accent).toBe("#123456");
    expect(merged.fontBody).toBe(theme.fontBody);
    expect(merged.buttonRadius).toBe(theme.buttonRadius);
    expect(rejectedKeys.sort()).toEqual(["buttonRadius", "fontBody"]);
    expect(mergeThemeOverride(theme, "garbage").theme).toEqual(theme);
  });
  it("round-trips a URL theme parameter and tolerates junk", () => {
    const encoded = encodeThemeParam({ accent: "#ff0000" });
    expect(decodeThemeParam(encoded)).toEqual({ accent: "#ff0000" });
    expect(decodeThemeParam("%%%")).toBeNull();
    expect(decodeThemeParam(null)).toBeNull();
  });
});

describe("demo analytics", () => {
  it("records, persists, caps and summarises events", () => {
    clearEvents();
    track("record_saved", { storeSlug: "x", recordId: "r1" });
    track("record_saved", { storeSlug: "x", recordId: "r2" });
    track("crate_opened", { storeSlug: "x", crateId: "c" });
    expect(getEvents().length).toBe(3);
    expect(summariseEvents(getEvents())[0]).toEqual({ name: "record_saved", count: 2 });
    expect(JSON.parse(window.localStorage.getItem("digcrates:events:v1") ?? "[]").length).toBe(3);
    for (let i = 0; i < 250; i += 1) track("record_viewed", { storeSlug: "x", recordId: String(i), mode: "crate" });
    expect(getEvents().length).toBe(200);
    clearEvents();
  });
});
