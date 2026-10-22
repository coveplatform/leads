import { expect, type FrameLocator, type Page } from "@playwright/test";

export const STORES = ["basement-wax", "sunday-records", "signal-records"] as const;

/** Open the host page, launch the overlay and return the iframe's locator once the app is ready. */
export async function openOverlay(page: Page, slug: string, { scrollTo = 0 } = {}): Promise<FrameLocator> {
  await page.goto(`/demo/hosts/${slug}`);
  if (scrollTo) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
  }
  await page.getByTestId("host-launcher").click();
  const frame = page.frameLocator("iframe[data-dig-iframe]");
  await expect(frame.getByTestId("dig-root")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator("[data-dig-loader]")).toHaveCount(0);
  return frame;
}

/** The "next record" control that is actually visible for the current viewport. */
export function nextButton(scope: FrameLocator | Page) {
  return scope.getByRole("button", { name: "Next record" }).filter({ visible: true }).first();
}

export function prevButton(scope: FrameLocator | Page) {
  return scope.getByRole("button", { name: "Previous record" }).filter({ visible: true }).first();
}

export async function selectCrate(scope: FrameLocator | Page, crateId: string) {
  await scope.getByTestId(`dig-crate-${crateId}`).click();
  await expect(scope.getByTestId("dig-crate-viewer")).toBeVisible();
}

export async function closePanel(scope: FrameLocator | Page, testId: string) {
  await scope.getByTestId(testId).getByRole("button", { name: "Close" }).click();
  await expect(scope.getByTestId(testId)).toHaveCount(0);
}

/** Dispatch a synthetic horizontal or vertical swipe on an element inside a frame or page. */
export async function swipe(scope: FrameLocator | Page, selector: string, dx: number, dy: number) {
  await scope.locator(selector).first().evaluate((el, delta) => {
    const rect = el.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const make = (type: string, x: number, y: number) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      const list = type === "touchend" ? [] : [touch];
      return new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: [touch] });
    };
    el.dispatchEvent(make("touchstart", startX, startY));
    el.dispatchEvent(make("touchmove", startX + delta.dx / 2, startY + delta.dy / 2));
    el.dispatchEvent(make("touchmove", startX + delta.dx, startY + delta.dy));
    el.dispatchEvent(make("touchend", startX + delta.dx, startY + delta.dy));
  }, { dx, dy });
}

/** Scroll a virtualised container step by step until an element matching `selector` is rendered. */
export async function scrollUntilRendered(container: import("@playwright/test").Locator, selector: string) {
  for (let i = 0; i < 40; i += 1) {
    if ((await container.locator(selector).count()) > 0) return;
    await container.evaluate((el, step) => el.scrollTo(0, el.scrollTop + step), 250);
    await container.page().waitForTimeout(50);
  }
  throw new Error(`${selector} never rendered`);
}
