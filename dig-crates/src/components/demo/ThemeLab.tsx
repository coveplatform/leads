"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StoreExperience } from "@/components/store-experience/StoreExperience";
import { ThemeTokensSchema, type CatalogSnapshot, type ThemeTokens } from "@/domain/types";
import { clearThemeDraft, loadThemeDraft, saveThemeDraft } from "@/lib/persisted-state";
import { encodeThemeParam, FONT_OPTIONS, themeContrastChecks, themeIsAccessible } from "@/lib/store-theme";

interface ThemeLabProps {
  snapshot: CatalogSnapshot;
  presets: Array<{ slug: string; name: string; theme: ThemeTokens }>;
}

const COLOUR_KEYS: Array<keyof ThemeTokens> = ["background", "surface", "surfaceRaised", "foreground", "foregroundMuted", "accent", "accentForeground", "border", "focusRing"];

/** Developer-only branding editor. Drafts live in this browser's localStorage only. */
export function ThemeLab({ snapshot, presets }: ThemeLabProps) {
  const base = snapshot.store.theme;
  const router = useRouter();
  // Rendered client-side only (see ThemeLabLoader), so the draft can be read during initialisation.
  const [initialDraft] = useState(() => loadThemeDraft(snapshot.store.slug));
  const [theme, setTheme] = useState<ThemeTokens>(initialDraft ?? base);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [status, setStatus] = useState<string>("");
  const [hasDraft, setHasDraft] = useState(initialDraft !== null);

  const checks = useMemo(() => themeContrastChecks(theme), [theme]);
  const accessible = useMemo(() => themeIsAccessible(theme), [theme]);
  const json = useMemo(() => JSON.stringify(theme, null, 2), [theme]);
  const embedUrl = `/embed/${snapshot.store.slug}?mode=inline&theme=${encodeThemeParam(theme)}`;

  const update = (patch: Partial<ThemeTokens>) => {
    const next = { ...theme, ...patch };
    const parsed = ThemeTokensSchema.safeParse(next);
    if (parsed.success) setTheme(parsed.data);
    else setStatus(`Rejected: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Theme JSON copied to clipboard.");
    } catch {
      setStatus("Clipboard unavailable; select the JSON below and copy it manually.");
    }
  };

  const exportJson = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${snapshot.store.slug}-theme.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Theme JSON downloaded.");
  };

  const previewSnapshot = useMemo(() => ({ ...snapshot, store: { ...snapshot.store, theme } }), [snapshot, theme]);

  return (
    <div className="hub" style={{ maxWidth: 1400 }} data-testid="theme-lab">
      <h1>Theme lab: {snapshot.store.name}</h1>
      <p className="hub-note">
        Demo customisation only. This is not a retailer admin dashboard: drafts are saved in this browser&rsquo;s localStorage and nothing is sent anywhere.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 24, alignItems: "start" }} className="theme-lab-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label>
            <strong>Store</strong>
            <select value={snapshot.store.slug} onChange={(e) => router.push(`/demo/theme-lab/${e.target.value}`)} style={{ display: "block", width: "100%", minHeight: 40 }} data-testid="lab-store">
              {presets.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <strong>Apply preset</strong>
            <select value="" onChange={(e) => { const p = presets.find((x) => x.slug === e.target.value); if (p) { setTheme(p.theme); setStatus(`Applied ${p.name} preset.`); } }} style={{ display: "block", width: "100%", minHeight: 40 }} data-testid="lab-preset">
              <option value="">Choose a preset…</option>
              {presets.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>

          <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <legend><strong>Colours</strong></legend>
            {COLOUR_KEYS.map((key) => (
              <label key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span>{key}</span>
                <input type="color" value={String(theme[key])} onChange={(e) => update({ [key]: e.target.value } as Partial<ThemeTokens>)} aria-label={`${key} colour`} data-testid={`lab-colour-${key}`} />
                <input type="text" value={String(theme[key])} onChange={(e) => update({ [key]: e.target.value } as Partial<ThemeTokens>)} aria-label={`${key} hex`} style={{ width: 90, fontFamily: "monospace" }} />
              </label>
            ))}
          </fieldset>

          <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <legend><strong>Type and shape</strong></legend>
            <label style={{ display: "block", marginBottom: 8 }}>Display font
              <select value={FONT_OPTIONS.some((f) => f.value === theme.fontDisplay) ? theme.fontDisplay : ""} onChange={(e) => update({ fontDisplay: e.target.value })} style={{ display: "block", width: "100%", minHeight: 36 }} data-testid="lab-font-display">
                {!FONT_OPTIONS.some((f) => f.value === theme.fontDisplay) ? <option value="">{theme.fontDisplay}</option> : null}
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>Body font
              <select value={FONT_OPTIONS.some((f) => f.value === theme.fontBody) ? theme.fontBody : ""} onChange={(e) => update({ fontBody: e.target.value })} style={{ display: "block", width: "100%", minHeight: 36 }}>
                {!FONT_OPTIONS.some((f) => f.value === theme.fontBody) ? <option value="">{theme.fontBody}</option> : null}
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            {(["buttonRadius", "cardRadius", "coverRadius"] as const).map((key) => (
              <label key={key} style={{ display: "block", marginBottom: 6 }}>{key}: {theme[key]}px
                <input type="range" min={0} max={40} value={theme[key]} onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<ThemeTokens>)} style={{ display: "block", width: "100%" }} data-testid={`lab-${key}`} />
              </label>
            ))}
            <label style={{ display: "block", marginBottom: 6 }}>Shadow
              <select value={theme.shadowStyle} onChange={(e) => update({ shadowStyle: e.target.value as ThemeTokens["shadowStyle"] })} style={{ display: "block", width: "100%", minHeight: 36 }}>
                <option value="none">none</option><option value="soft">soft</option><option value="strong">strong</option>
              </select>
            </label>
            <label style={{ display: "block" }}>Header style
              <select value={theme.headerStyle} onChange={(e) => update({ headerStyle: e.target.value as ThemeTokens["headerStyle"] })} style={{ display: "block", width: "100%", minHeight: 36 }} data-testid="lab-header-style">
                <option value="minimal">minimal</option><option value="editorial">editorial</option><option value="bold">bold</option>
              </select>
            </label>
          </fieldset>

          <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <legend><strong>Logo</strong></legend>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>Logos are store assets served from <code>/demo-logos</code>; uploads are out of scope. Current: <code>{snapshot.store.logoUrl ?? "none (name shown as text)"}</code></p>
          </fieldset>

          <div>
            <strong>Contrast checks</strong> <span data-testid="lab-accessible">{accessible ? "✓ core pairs reach WCAG AA" : "⚠ some core pairs fail WCAG AA"}</span>
            <table style={{ marginTop: 6 }}>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.pair}>
                    <td>{c.pair}</td>
                    <td>{c.ratio.toFixed(2)}:1</td>
                    <td>{c.passesAA ? "AA" : c.passesAALarge ? "AA large only" : "fail"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={copy} data-testid="lab-copy">Copy JSON</button>
            <button type="button" onClick={exportJson} data-testid="lab-export">Export JSON</button>
            <button type="button" onClick={() => { saveThemeDraft(snapshot.store.slug, theme); setHasDraft(true); setStatus("Draft saved in this browser."); }} data-testid="lab-save">Save draft (localStorage)</button>
            <button type="button" onClick={() => { clearThemeDraft(snapshot.store.slug); setHasDraft(false); setTheme(base); setStatus("Reset to seeded defaults."); }} data-testid="lab-reset">Reset to defaults</button>
          </div>
          {hasDraft ? <p style={{ margin: 0, fontSize: "0.85rem" }}>A saved draft is loaded.</p> : null}
          <p role="status" style={{ margin: 0, fontSize: "0.9rem" }} data-testid="lab-status">{status}</p>
          <details>
            <summary>Theme JSON</summary>
            <pre data-testid="lab-json">{json}</pre>
          </details>
          <p style={{ fontSize: "0.9rem" }}>Embedded sample with this theme: <a href={embedUrl} target="_blank" rel="noopener">open /embed in a new tab</a></p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <strong>Live preview</strong>
            <button type="button" onClick={() => setViewport("desktop")} aria-pressed={viewport === "desktop"}>Desktop</button>
            <button type="button" onClick={() => setViewport("mobile")} aria-pressed={viewport === "mobile"}>Mobile 390px</button>
            <span style={{ fontSize: "0.85rem" }}>Same engine, same data contract; only tokens change.</span>
          </div>
          <div style={{ width: viewport === "mobile" ? 390 : "100%", height: 720, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", maxWidth: "100%" }} data-testid="lab-preview">
            <StoreExperience key={viewport} catalog={previewSnapshot} presentationMode="inline" ephemeral />
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .theme-lab-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
