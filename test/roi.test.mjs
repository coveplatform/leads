import { test } from "node:test";
import assert from "node:assert/strict";
import { periodToRange, buildRoiSummaryLine } from "../src/roi.js";

test("periodToRange: rolling month", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const r = periodToRange("month", now);
  assert.equal(r.label, "This month");
  assert.equal(r.months, 1);
  assert.equal(r.until.getTime(), now.getTime());
  assert.equal(Math.round((now - r.since) / 86400000), 30);
});

test("periodToRange: all time", () => {
  const r = periodToRange("all", new Date("2026-06-15T12:00:00Z"));
  assert.equal(r.label, "All time");
  assert.equal(r.months, null);
  assert.equal(r.since.getTime(), 0);
});

test("periodToRange: previous calendar month", () => {
  const r = periodToRange("last_month", new Date("2026-06-15T12:00:00Z"));
  assert.equal(r.label, "May 2026");
  assert.equal(r.months, 1);
  assert.equal(r.since.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(r.until.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("periodToRange: arbitrary day window", () => {
  const r = periodToRange("7", new Date("2026-06-15T12:00:00Z"));
  assert.equal(r.label, "Last 7 days");
  assert.equal(r.months, 1);
});

test("buildRoiSummaryLine reads like the dashboard hero", () => {
  const line = buildRoiSummaryLine({
    label: "This month", recoveredCalls: 23, booked: 9, estimatedValue: 61000, cost: 89,
  });
  assert.equal(line, "This month: 23 calls recovered · 9 booked · ~$61,000 in jobs · you paid $89.");
});

test("buildRoiSummaryLine singularises a single call and omits cost when null", () => {
  const line = buildRoiSummaryLine({
    label: "All time", recoveredCalls: 1, booked: 0, estimatedValue: 0, cost: null,
  });
  assert.equal(line, "All time: 1 call recovered · 0 booked · ~$0 in jobs.");
});
