// Recovered-revenue / ROI engine — the churn-killer. Aggregates what Cove did
// for a business over a period and frames it against what they paid:
//   "This month: 23 calls recovered · 9 booked · ~$61,000 in jobs · you paid $89."
//
// Powers GET /api/me/roi (dashboard hero) and the monthly "what Cove made you"
// email.

// Note: db.js is imported lazily inside computeRoi so the pure helpers
// (periodToRange / buildRoiSummaryLine) can be unit-tested without a DATABASE_URL.

export const DEFAULT_MONTHLY_PRICE = Number(process.env.COVE_MONTHLY_PRICE || 89);

function money(n) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

// Resolve a period string to a [since, until) range.
//   "month"       rolling last 30 days   (dashboard hero)
//   "last_month"  previous calendar month (monthly email)
//   "all"         all time
//   "<n>"         last n days
export function periodToRange(period = "month", now = new Date()) {
  const until = new Date(now.getTime());

  if (period === "all") {
    return { since: new Date(0), until, label: "All time", months: null };
  }
  if (period === "last_month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const label = first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    return { since: first, until: next, label, months: 1 };
  }
  const days = period === "month" ? 30 : (Number(period) || 30);
  const since = new Date(now.getTime() - days * 86400000);
  const label = days === 30 ? "This month" : `Last ${days} days`;
  return { since, until, label, months: Math.max(1, Math.round(days / 30)) };
}

export function buildRoiSummaryLine({ label, recoveredCalls, booked, estimatedValue, cost }) {
  const parts = [
    `${recoveredCalls} call${recoveredCalls === 1 ? "" : "s"} recovered`,
    `${booked} booked`,
    `~${money(estimatedValue)} in jobs`,
  ];
  if (cost != null) parts.push(`you paid ${money(cost)}`);
  return `${label}: ${parts.join(" · ")}.`;
}

export async function computeRoi(business, period = "month", now = new Date(), monthlyPrice = DEFAULT_MONTHLY_PRICE) {
  const { since, until, label, months } = periodToRange(period, now);
  const avg = Number(business.avg_job_value) || 0;

  const { getRoiAggregate } = await import("./db.js");
  const agg = await getRoiAggregate(business.id, since.toISOString(), until.toISOString(), avg);

  const recoveredCalls = Number(agg.captured) || 0;
  const conversations = Number(agg.qualified) || 0;
  const booked = Number(agg.booked) || 0;
  const won = Number(agg.won) || 0;
  const lost = Number(agg.lost) || 0;
  const wonValue = Number(agg.won_value) || 0;
  const bookedPipeline = Number(agg.booked_pipeline) || 0;
  // No double count: booked_pipeline excludes won/lost leads.
  const estimatedValue = wonValue + bookedPipeline;

  const cost = months == null ? null : Math.round(monthlyPrice * months);
  const roiMultiple = cost && cost > 0 ? Number((estimatedValue / cost).toFixed(1)) : null;

  return {
    period, label,
    recoveredCalls, conversations, booked, won, lost,
    wonValue, bookedPipeline, estimatedValue,
    avgJobValue: avg, monthlyPrice, cost, roiMultiple,
    hasOutcomes: won + lost > 0,
    summary: buildRoiSummaryLine({ label, recoveredCalls, booked, estimatedValue, cost }),
  };
}
