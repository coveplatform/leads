import { expect, test } from "@playwright/test";
import { closePanel, nextButton, openOverlay, prevButton, scrollUntilRendered, selectCrate, swipe } from "./helpers";

test.describe("1. Full-screen overlay on a demo shop", () => {
  test("launch, browse, save, inspect pile, close with host scroll and focus restored", async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const frame = await openOverlay(page, "basement-wax", { scrollTo: 240 });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);
    await expect(page.locator("body")).toHaveAttribute("data-dig-open", "basement-wax");
    await expect(page.getByTestId("host-launcher")).toBeAttached(); // host remains beneath

    await selectCrate(frame, "basement-wax-techno");
    await expect(frame.getByTestId("dig-crate-name")).toHaveText("Techno");
    await expect(frame.getByTestId("dig-result-count")).toHaveText("36 records");
    for (let i = 0; i < 5; i += 1) await nextButton(frame).click();
    await expect(frame.getByTestId("dig-progress")).toHaveText("6 / 36");

    const rail = frame.getByTestId("dig-rail");
    await rail.locator("[data-testid^='pile-toggle-']").click();
    await nextButton(frame).click();
    await rail.locator("[data-testid^='pile-toggle-']").click();
    await expect(frame.getByTestId("dig-pile-count")).toHaveText("2");

    await frame.getByTestId("dig-pile-button").click();
    await expect(frame.locator("[data-testid^='pile-row-']")).toHaveCount(2);
    await expect(frame.getByTestId("dig-pile")).toContainText("Indicative demo total; no checkout");
    await closePanel(frame, "dig-pile");
    await expect(frame.getByTestId("dig-progress")).toHaveText("7 / 36");

    await frame.getByTestId("dig-close").click();
    await expect(page.locator("[data-dig-overlay]")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    if (!isMobile) expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("host-launcher");
    expect(errors).toEqual([]);
  });
});

test.describe("2. Mobile crate navigation", () => {
  test("mobile bar, swipe with intent, save from details", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile viewport only");
    await page.goto("/store/basement-wax?crate=basement-wax-house&view=crate");
    await expect(page.getByTestId("dig-mobile-bar")).toBeVisible();
    await expect(page.getByTestId("dig-progress")).toHaveText("1 / 36");
    await nextButton(page).click();
    await expect(page.getByTestId("dig-progress")).toHaveText("2 / 36");
    await prevButton(page).click();
    await expect(page.getByTestId("dig-progress")).toHaveText("1 / 36");

    await swipe(page, ".dig-hero-cover", -120, 4);
    await expect(page.getByTestId("dig-progress")).toHaveText("2 / 36");
    await swipe(page, ".dig-hero-cover", 10, 160); // vertical intent: must not navigate
    await expect(page.getByTestId("dig-progress")).toHaveText("2 / 36");
    await swipe(page, ".dig-hero-cover", 120, -6);
    await expect(page.getByTestId("dig-progress")).toHaveText("1 / 36");

    await expect(page.getByTestId("dig-mobile-listen")).toBeVisible();
    await page.getByTestId("dig-rail").locator("[data-testid^='details-']").click();
    const details = page.getByTestId("dig-details");
    await expect(details).toBeVisible();
    await details.locator("[data-testid^='pile-toggle-']").click();
    await expect(page.getByTestId("dig-pile-count")).toHaveText("1");
    await closePanel(page, "dig-details");
    await expect(page.getByTestId("dig-progress")).toHaveText("1 / 36");
  });
});

test.describe("3. Wall mode", () => {
  test("search and filter, open the 20th result, return to the same scroll position", async ({ page }) => {
    await page.goto("/store/basement-wax?crate=basement-wax-all&view=wall");
    await expect(page.getByTestId("dig-wall")).toBeVisible();
    await expect(page.getByTestId("dig-result-count")).toHaveText("180 records");

    await page.getByTestId("dig-filters-button").click();
    await page.getByTestId("filter-genre-House").check();
    await expect(page.getByTestId("dig-filters-show")).toHaveText("Show 36 records");
    await page.getByTestId("dig-filters-show").click();
    await expect(page.getByTestId("dig-result-count")).toHaveText("36 records");

    if (!(await page.getByTestId("dig-search").isVisible())) await page.getByTestId("dig-search-toggle").click();
    await page.getByTestId("dig-search").fill("night");
    await expect(page.getByTestId("dig-result-count")).not.toHaveText("36 records");
    const narrowed = await page.getByTestId("dig-result-count").textContent();
    await page.getByTestId("dig-search").fill("");
    await expect(page.getByTestId("dig-result-count")).toHaveText("36 records");
    expect(narrowed).not.toBe("36 records");

    const wall = page.getByTestId("dig-wall");
    await scrollUntilRendered(wall, "[data-index='19']");
    const twentieth = wall.locator("[data-index='19']");
    await twentieth.scrollIntoViewIfNeeded();
    expect(await wall.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const positionBefore = await wall.evaluate((el) => el.scrollTop);
    const label = await twentieth.getAttribute("aria-label");
    await twentieth.click();
    const details = page.getByTestId("dig-details");
    await expect(details).toBeVisible();
    await expect(details.getByRole("heading", { level: 2 })).toContainText((label ?? "").split(",")[0] ?? "");
    await closePanel(page, "dig-details");
    expect(await wall.evaluate((el) => el.scrollTop)).toBe(positionBefore);
    await expect(twentieth).toHaveAttribute("aria-current", "true");
  });
});

test.describe("4. Listening mode", () => {
  test("play on demand, switching records stops the previous preview, closing the overlay removes audio", async ({ page }) => {
    const frame = await openOverlay(page, "basement-wax");
    await selectCrate(frame, "basement-wax-house");
    await frame.getByTestId("dig-tab-listen").click();
    await expect(frame.getByTestId("dig-listen")).toBeVisible();
    const root = frame.getByTestId("dig-root");
    await expect(root).toHaveAttribute("data-audio-status", "idle"); // nothing autoplays

    // Rows are virtualised, so pin the first two previewable records by id before clicking.
    const firstRow = frame.locator("[data-testid^='listen-row-']").first();
    await firstRow.scrollIntoViewIfNeeded();
    const ids = await frame.locator("[data-testid^='listen-play-']").evaluateAll((els) => els.slice(0, 2).map((el) => (el.getAttribute("data-testid") ?? "").replace("listen-play-", "")));
    const [firstId, secondId] = ids as [string, string];
    await frame.getByTestId(`listen-play-${firstId}`).click();
    await expect(root).toHaveAttribute("data-audio-record", firstId);
    await expect(root).toHaveAttribute("data-audio-status", /playing|loading/);
    await frame.getByTestId(`listen-play-${secondId}`).click();
    await expect(root).toHaveAttribute("data-audio-record", secondId);
    await expect(frame.getByTestId("dig-listen-title")).toBeVisible();
    await frame.getByTestId("dig-tab-crate").click();
    await expect(root).toHaveAttribute("data-audio-status", "idle"); // mode change stops playback
    await frame.getByTestId("dig-close").click();
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});

test.describe("5. Theme lab", () => {
  test("switching presets restyles the same engine and exports JSON", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop layout only");
    await page.goto("/demo/theme-lab/basement-wax");
    const preview = page.getByTestId("lab-preview").getByTestId("dig-root");
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((el) => el.style.getPropertyValue("--dig-accent"))).toBe("#D29A68");
    await expect(preview.getByTestId("dig-crate-basement-wax-house")).toHaveAccessibleName(/House, 36 records/);

    await page.getByTestId("lab-preset").selectOption("sunday-records");
    expect(await preview.evaluate((el) => el.style.getPropertyValue("--dig-accent"))).toBe("#35634D");
    await expect(preview).toHaveClass(/dig-header-editorial/);
    await expect(preview.getByTestId("dig-crate-basement-wax-house")).toHaveAccessibleName(/House, 36 records/); // same data contract
    await expect(page.getByTestId("lab-json")).toContainText('"accent": "#35634D"');
    await expect(page.getByTestId("lab-accessible")).toContainText("reach WCAG AA");

    await page.getByTestId("lab-colour-foreground").fill("#cccccc");
    await expect(page.getByTestId("lab-accessible")).toContainText("fail");

    const download = page.waitForEvent("download");
    await page.getByTestId("lab-export").click();
    expect((await download).suggestedFilename()).toBe("basement-wax-theme.json");
    await page.getByTestId("lab-reset").click();
    expect(await preview.evaluate((el) => el.style.getPropertyValue("--dig-accent"))).toBe("#D29A68");
  });
});

test.describe("6. Store isolation", () => {
  test("piles and catalogues never leak between stores", async ({ page }) => {
    await page.goto("/store/basement-wax?crate=basement-wax-all&view=crate");
    await page.getByTestId("dig-rail").locator("[data-testid^='pile-toggle-']").click();
    await expect(page.getByTestId("dig-pile-count")).toHaveText("1");
    await page.goto("/store/sunday-records");
    await expect(page.getByTestId("dig-root")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("dig-pile-count")).toHaveText("0");
    await expect(page.getByTestId("dig-store-name")).toHaveText(/Sunday Records/);
    await page.getByTestId("dig-crate-sunday-records-jazz").click();
    await expect(page.getByTestId("dig-record-artist")).not.toHaveText(/Glass Circuit/);
    await page.getByTestId("dig-rail").locator("[data-testid^='pile-toggle-']").click();
    await page.goto("/store/basement-wax");
    await expect(page.getByTestId("dig-pile-count")).toHaveText("1");
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("digcrates:pile:")).sort());
    expect(keys).toEqual(["digcrates:pile:basement-wax:v1", "digcrates:pile:sunday-records:v1"]);
    await page.reload();
    await expect(page.getByTestId("dig-pile-count")).toHaveText("1");
    await expect(page.getByTestId("dig-root")).toHaveAttribute("data-audio-status", "idle");
  });
});

test.describe("7. Inline embed", () => {
  test("works inside a shop page at narrow width without hijacking host scroll", async ({ page }) => {
    await page.goto("/demo/hosts/signal-records/crates");
    const iframe = page.locator("iframe[data-dig-inline-frame]");
    await expect(iframe).toBeVisible();
    const frame = page.frameLocator("iframe[data-dig-inline-frame]");
    await expect(frame.getByTestId("dig-root")).toHaveAttribute("data-presentation", "inline");
    await expect(frame.getByTestId("dig-close")).toHaveCount(0);
    const box = await iframe.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box!.width).toBeGreaterThan(300);

    await frame.getByTestId("dig-crate-signal-records-disco").click();
    await expect(frame.getByTestId("dig-crate-viewer")).toBeVisible();
    await frame.getByTestId("dig-tab-wall").click();
    const wall = frame.getByTestId("dig-wall");
    await wall.evaluate((el) => el.scrollTo(0, 400));
    expect(await wall.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(10, 10);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});

test.describe("8. Unknown store", () => {
  test("renders clean not-found states with no runtime crash", async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto("/store/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await page.goto("/embed/does-not-exist?mode=overlay");
    await expect(page.getByTestId("embed-not-found")).toBeVisible();
    const api = await request.get("/api/demo/stores/does-not-exist/records");
    expect(api.status()).toBe(404);
    expect(await api.json()).toMatchObject({ error: "Store not found", isDemo: true });
    const bad = await request.get("/api/demo/stores/basement-wax/records?limit=999999");
    expect(bad.status()).toBe(400);
    const leak = await request.get("/api/demo/stores/basement-wax/related/su-001");
    expect(leak.status()).toBe(404);
    expect(errors).toEqual([]);
  });
});

test.describe("9. Keyboard access", () => {
  test("open with Enter, Escape closes from the host and from inside, focus returns to the launcher", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow is a desktop concern");
    await page.goto("/demo/hosts/sunday-records");
    const launcher = page.getByTestId("host-launcher");
    await launcher.focus();
    await page.keyboard.press("Enter");
    const frame = page.frameLocator("iframe[data-dig-iframe]");
    await expect(frame.getByTestId("dig-root")).toHaveAttribute("data-hydrated", "true");
    await expect(page.locator("[data-dig-close]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-dig-overlay]")).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("host-launcher");

    await page.keyboard.press("Enter");
    await expect(frame.getByTestId("dig-root")).toHaveAttribute("data-hydrated", "true");
    await frame.getByTestId("dig-crate-sunday-records-jazz").click();
    await frame.getByTestId("dig-tab-wall").click();
    const firstTile = frame.locator("[data-testid^='wall-tile-']").first();
    await firstTile.focus();
    await page.keyboard.press("ArrowRight");
    await expect(frame.locator("[data-testid^='wall-tile-']").nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(frame.getByTestId("dig-details")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(frame.getByTestId("dig-details")).toHaveCount(0);
    await expect(frame.locator("[data-testid^='wall-tile-']").nth(1)).toBeFocused();
    await page.keyboard.press("Escape"); // no panel open: closes the overlay from inside the iframe
    await expect(page.locator("[data-dig-overlay]")).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("host-launcher");
  });
});

test.describe("10. Stress fixture", () => {
  test("5,000 records stay responsive with a virtualised wall", async ({ page }) => {
    await page.goto("/store/stress-test?crate=stress-test-all&view=wall");
    await expect(page.getByTestId("dig-result-count")).toHaveText("5000 records");
    const tiles = page.locator("[data-testid^='wall-tile-']");
    expect(await tiles.count()).toBeLessThan(200);
    const wall = page.getByTestId("dig-wall");
    await wall.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(async () => tiles.count()).toBeLessThan(200);
    if (!(await page.getByTestId("dig-search").isVisible())) await page.getByTestId("dig-search-toggle").click();
    const started = Date.now();
    await page.getByTestId("dig-search").fill("night");
    await expect(page.getByTestId("dig-result-count")).not.toHaveText("5000 records");
    expect(Date.now() - started).toBeLessThan(3000);
    await page.getByTestId("dig-filters-button").click();
    await page.getByTestId("filter-available-only").check();
    await page.getByTestId("dig-filters-show").click();
    await page.getByTestId("dig-tab-listen").click();
    await expect(page.getByTestId("dig-listen")).toBeVisible();
    expect(await page.locator("[data-testid^='listen-row-']").count()).toBeLessThan(100);
  });
});
