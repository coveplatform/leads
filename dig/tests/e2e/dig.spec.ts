import { expect, test } from "@playwright/test";

test.describe("DIG guest journey", () => {
  test("guest digs, keeps, digs deeper, backtracks, corrects a branch and resumes after reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("main").getByText("Find something you weren't looking for."),
    ).toBeVisible();
    await page.getByTestId("demo-dig").click();
    await expect(page).toHaveURL(/\/dig\//);
    // Fresh browser context => the one-time tutorial always shows; dismiss it.
    await page.getByTestId("tutorial-done").click();

    const card = page.getByTestId("current-card");
    await expect(card).toBeVisible();
    const seedId = await card.getAttribute("data-recording-id");
    // Honest player: either an embed button or an outbound listen link.
    await expect(
      page.getByRole("link", { name: /Listen on|Open on|Open original/ }).first(),
    ).toBeVisible();

    await page.getByTestId("keep").click();
    await expect(page.getByText(/Kept\. Saved to All Finds/)).toBeVisible();

    await page.getByTestId("dig-deeper").click();
    await page.getByTestId("mode-connections").click();
    await page.getByTestId("select-branch").first().click();
    await expect(card).not.toHaveAttribute("data-recording-id", seedId!);
    await expect(page.getByText(/^Because:/)).toBeVisible();
    const secondId = await card.getAttribute("data-recording-id");

    await page.getByTestId("back").click();
    await expect(card).toHaveAttribute("data-recording-id", seedId!);

    await page.getByTestId("dig-deeper").click();
    await page.getByTestId("mode-unexpected").click();
    await page.getByTestId("dig-go").click();
    await expect(card).not.toHaveAttribute("data-recording-id", seedId!);
    await page.getByTestId("wrong-direction").click();
    await page.getByTestId("reason-too_similar").click();
    await expect(page.getByText(/Changed this dig only/)).toBeVisible();
    await page.getByTestId("back-to-good").click();
    await expect(card).toHaveAttribute("data-recording-id", seedId!);

    const url = page.url();
    await page.reload();
    await expect(page.getByTestId("current-card")).toHaveAttribute("data-recording-id", seedId!);
    await page.getByTestId("trail-button").click();
    await expect(page.getByRole("dialog", { name: "Trail" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/crates");
    await page.getByRole("link", { name: /All Finds/ }).click();
    await expect(page.getByTestId("crate-items").locator("li")).toHaveCount(1);
    await page.goto("/history");
    await expect(page.getByTestId("history-list").locator("li").first()).toBeVisible();
    await page.goto(url);
    await expect(page.getByTestId("current-card")).toBeVisible();
    void secondId;
  });

  test("paste an unsupported link: retained without crashing; a YouTube link gets an honest embed", async ({
    page,
  }) => {
    await page.goto("/imports");
    await page
      .getByTestId("import-textarea")
      .fill("https://www.instagram.com/reel/xyz/\nhttps://youtu.be/dQw4w9WgXcQ");
    await page.getByTestId("import-submit").click();
    const list = page.getByTestId("import-list");
    await expect(list.locator("li[data-status='unsupported']")).toHaveCount(1);
    await expect(
      list.locator("li[data-status='unresolved'], li[data-status='needs_confirmation']"),
    ).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Load YouTube player/ })).toBeVisible();
  });

  test("personalisation is opt-in and separate from session signals", async ({ page }) => {
    await page.goto("/profile");
    const optIn = page.getByTestId("opt-in");
    await expect(optIn).not.toBeChecked();
    await expect(page.getByTestId("stable-taste")).toContainText("Personalisation is off");
    await optIn.check();
    await expect(page.getByTestId("stable-taste")).toContainText(/Nothing yet|signals/);
  });

  test("keyboard: all main actions reachable without a pointer; reduced motion honoured", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByTestId("demo-dig").click();
    await expect(page).toHaveURL(/\/dig\//);
    // Fresh browser context => the one-time tutorial always shows; dismiss it.
    await page.getByTestId("tutorial-done").click();
    await page.keyboard.press("k");
    await expect(page.getByText(/Kept\./)).toBeVisible();
    const dur = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--dur").trim(),
    );
    expect(dur).toBe("0ms");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "INPUT", "SUMMARY"]).toContain(focused);
  });
});
