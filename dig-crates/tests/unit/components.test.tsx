import { describe, expect, it, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreExperience } from "@/components/store-experience/StoreExperience";
import { audioController } from "@/lib/audio-controller";
import { makeSnapshot, sampleRecords } from "./helpers";

function renderStore(overrides: Partial<React.ComponentProps<typeof StoreExperience>> = {}) {
  const snapshot = makeSnapshot(sampleRecords());
  const utils = render(<StoreExperience catalog={snapshot} presentationMode="standalone" ephemeral {...overrides} />);
  return { ...utils, snapshot };
}

describe("StoreExperience", () => {
  it("renders the crates landing with counts and applies theme tokens on the DIG root only", () => {
    renderStore();
    expect(screen.getByRole("heading", { name: /dig through our crates/i })).toBeInTheDocument();
    expect(screen.getByTestId("dig-crate-c-house")).toHaveAccessibleName(/House, 3 records/);
    const root = screen.getByTestId("dig-root");
    expect(root.style.getPropertyValue("--dig-accent")).toBe("#d29a68");
    expect(document.body.style.getPropertyValue("--dig-accent")).toBe("");
    expect(root.className).toContain("dig-header-minimal");
  });

  it("theme overrides change root tokens and reject invalid values", () => {
    renderStore({ themeOverride: { accent: "#00ff00", headerStyle: "bold", fontBody: "bad; injection" } });
    const root = screen.getByTestId("dig-root");
    expect(root.style.getPropertyValue("--dig-accent")).toBe("#00ff00");
    expect(root.className).toContain("dig-header-bold");
    expect(screen.getByText(/invalid and ignored: fontBody/)).toBeInTheDocument();
  });

  it("navigates crate mode with buttons and keyboard, keeping filters", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("dig-record-title")).toHaveTextContent("Night Transit Dubs");
    await user.click(screen.getByTestId("dig-next"));
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("2 / 3");
    screen.getByRole("group").focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("3 / 3");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("dig-end-of-crate")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restart crate" }));
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("1 / 3");
    screen.getByRole("group").focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("dig-notice")).toHaveTextContent(/start of this crate/);
  });

  it("switches view modes without losing the selected record", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    await user.click(screen.getByTestId("dig-next"));
    const title = screen.getByTestId("dig-record-title").textContent;
    await user.click(screen.getByTestId("dig-tab-wall"));
    expect(screen.getByTestId("dig-wall")).toBeInTheDocument();
    expect(screen.getByTestId("wall-tile-r2")).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByTestId("dig-tab-listen"));
    expect(screen.getByTestId("dig-listen-title")).toHaveTextContent(title ?? "");
    await user.click(screen.getByTestId("dig-tab-crate"));
    expect(screen.getByTestId("dig-record-title")).toHaveTextContent(title ?? "");
  });

  it("shows a helpful no-results state with one-click reset", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    await user.click(screen.getByTestId("dig-filters-button"));
    await user.click(screen.getByTestId("filter-genre-Ambient"));
    expect(screen.getByTestId("dig-filters-show")).toHaveTextContent("Show 0 records");
    await user.click(within(screen.getByTestId("dig-filters")).getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("dig-empty-crate")).toBeInTheDocument();
    await user.click(within(screen.getByTestId("dig-empty-crate")).getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("1 / 3");
  });

  it("opens and closes details without moving the viewer, restoring focus", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    await user.click(screen.getByTestId("dig-next"));
    const details = screen.getByTestId("details-r2");
    await user.click(details);
    const dialog = screen.getByTestId("dig-details");
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent("Glass Circuit – Soft Machines");
    await user.click(within(dialog).getByTestId("demo-buy"));
    expect(within(dialog).getByTestId("demo-buy-notice")).toHaveTextContent(/no purchase will be made/i);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("dig-details")).not.toBeInTheDocument();
    expect(screen.getByTestId("dig-progress")).toHaveTextContent("2 / 3");
  });

  it("updates the pile count immediately and shows an indicative total", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    expect(screen.getByTestId("dig-pile-count")).toHaveTextContent("0");
    await user.click(screen.getByTestId("pile-toggle-r6"));
    expect(screen.getByTestId("dig-pile-count")).toHaveTextContent("1");
    await user.click(screen.getByTestId("dig-next"));
    await user.click(screen.getByTestId("pile-toggle-r2"));
    expect(screen.getByTestId("dig-pile-count")).toHaveTextContent("2");
    await user.click(screen.getByTestId("dig-pile-button"));
    expect(screen.getByTestId("dig-pile-total")).toHaveTextContent("$74.00");
    await user.click(screen.getByTestId("dig-pile-checkout"));
    expect(screen.getByTestId("dig-pile-checkout-notice")).toHaveTextContent(/no purchase/i);
    await user.click(screen.getByTestId("pile-remove-r6"));
    expect(screen.getByTestId("dig-pile-count")).toHaveTextContent("1");
  });

  it("shows preview unavailable, plays only on click, and stops when navigating", async () => {
    const user = userEvent.setup();
    const stop = vi.spyOn(audioController, "stop");
    const play = vi.spyOn(audioController, "play");
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-all"));
    // r6 is first (recent), has a preview
    expect(play).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("play-toggle"));
    expect(play).toHaveBeenCalledWith("r6", "/demo-audio/demo-loop-01.wav");
    await act(async () => {
      await Promise.resolve();
    });
    await user.click(screen.getByTestId("dig-next"));
    expect(stop).toHaveBeenCalled();
    await user.click(screen.getByTestId("dig-next"));
    await user.click(screen.getByTestId("dig-next"));
    expect(screen.getByTestId("dig-record-title")).toHaveTextContent("Tidal Phase");
    expect(screen.getByTestId("preview-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("play-toggle")).not.toBeInTheDocument();
    stop.mockRestore();
    play.mockRestore();
  });

  it("dig around this lists same-store results with explanations and supports a trail", async () => {
    const user = userEvent.setup();
    renderStore();
    await user.click(screen.getByTestId("dig-crate-c-house"));
    await user.click(screen.getByTestId("dig-next"));
    await user.click(screen.getByTestId("dig-around-r2"));
    const panel = screen.getByTestId("dig-related");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("Dig around Glass Circuit – Soft Machines");
    expect(within(panel).getByTestId("related-row-r1")).toHaveTextContent("Same artist");
    await user.click(within(panel).getByTestId("related-follow-r1"));
    expect(within(panel).getByTestId("dig-trail")).toHaveTextContent("Night Index EP");
    await user.click(within(panel).getByTestId("dig-trail-back"));
    expect(within(panel).queryByTestId("dig-trail")).not.toBeInTheDocument();
  });
});
