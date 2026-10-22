import type { Catalogue } from "@/lib/catalogue/graph";
import { buildCard } from "@/lib/catalogue/graph";
import type { Suggestion } from "@/domain/types";
import { bandOf, retrievePaths } from "./candidates";
import { buildExplanation } from "./explain";
import { scoreCandidate } from "./score";
import { selectPage } from "./diversity";
import type { Band, RankContext } from "./types";

export * from "./types";
export * from "./weights";
export { bandOf, retrievePaths } from "./candidates";
export { scoreCandidate } from "./score";
export { buildExplanation, hopHeadline } from "./explain";

export interface RankResult {
  suggestions: Suggestion[];
  poolSize: number;
  exhausted: boolean;
}

/** Pure: same catalogue + same context => same output. */
export function nextDigCandidates(cat: Catalogue, ctx: RankContext): RankResult {
  const paths = retrievePaths(cat, ctx);
  const bands = new Map<string, Band>();
  const scored = [...paths.values()]
    .filter((p) => cat.sources.has(p.target) || cat.recordings.get(p.target))
    .map((p) => {
      bands.set(p.target, bandOf(p));
      return scoreCandidate(cat, p, ctx);
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.recordingId.localeCompare(b.recordingId))
    .slice(0, ctx.poolSize);
  const page = selectPage(cat, scored, bands, ctx);
  const suggestions: Suggestion[] = [];
  for (const s of page) {
    const card = buildCard(cat, s.recordingId);
    if (!card) continue;
    suggestions.push({
      candidateId: `${ctx.currentRecordingId.slice(0, 8)}-${s.recordingId}`,
      card,
      explanation: buildExplanation(cat, s.path, ctx, bands.get(s.recordingId) ?? "adjacent"),
      score: s.score,
      viaEdgeId: s.path.hops[s.path.hops.length - 1]?.edgeId.startsWith("curation:")
        ? null
        : (s.path.hops[s.path.hops.length - 1]?.edgeId ?? null),
      scoreDebugAvailable: ctx.includeTrace,
      ...(ctx.includeTrace ? { trace: s.trace } : {}),
    });
  }
  return { suggestions, poolSize: scored.length, exhausted: scored.length === 0 };
}
