import { test } from "@playwright/test";
import { closePanel, openOverlay, selectCrate } from "./helpers";
import { STORES } from "./helpers";

/**
 * Captures the documentation screenshots (docs/screenshots/<project>/...).
 * Run with: npm run screenshots
 */
test.describe("screenshots", () => {
  test.skip(!process.env.DIG_SCREENSHOTS, "set DIG_SCREENSHOTS=1 to capture documentation screenshots");

  for (const slug of STORES) {
    test(`capture ${slug}`, async ({ page }, info) => {
      const dir = `docs/screenshots/${info.project.name}`;
      const shot = (name: string) => page.screenshot({ path: `${dir}/${slug}-${name}.png`, fullPage: false });
      await page.goto(`/demo/hosts/${slug}`);
      await shot("host");
      const frame = await openOverlay(page, slug);
      await page.waitForTimeout(300);
      await shot("home");
      const crate = slug === "basement-wax" ? `${slug}-techno` : slug === "sunday-records" ? `${slug}-jazz` : `${slug}-disco`;
      await selectCrate(frame, crate);
      await page.waitForTimeout(300);
      await shot("crate");
      await frame.getByTestId("dig-tab-wall").click();
      await page.waitForTimeout(400);
      await shot("wall");
      await frame.getByTestId("dig-tab-listen").click();
      await page.waitForTimeout(300);
      await shot("listen");
      await frame.getByTestId("dig-tab-crate").click();
      await frame.getByTestId("dig-rail").locator("[data-testid^='pile-toggle-']").click();
      await frame.getByTestId("dig-rail").locator("[data-testid^='details-']").click();
      await page.waitForTimeout(300);
      await shot("details");
      await closePanel(frame, "dig-details");
      await frame.getByTestId("dig-rail").locator("[data-testid^='dig-around-']").click();
      await page.waitForTimeout(300);
      await shot("related");
      await closePanel(frame, "dig-related");
      await frame.getByTestId("dig-pile-button").click();
      await page.waitForTimeout(300);
      await shot("pile");
    });
  }

  test("capture inline embed and theme lab", async ({ page }, info) => {
    const dir = `docs/screenshots/${info.project.name}`;
    await page.goto("/demo/hosts/signal-records/crates");
    await page.locator("iframe[data-dig-inline-frame]").waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/signal-records-inline-embed.png` });
    await page.goto("/demo/theme-lab/sunday-records");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${dir}/theme-lab.png` });
  });
});
