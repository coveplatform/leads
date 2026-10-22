import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { buildCard, getCatalogue } from "@/lib/catalogue/graph";
import { playerConfigForSource } from "@/lib/providers/player";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db }, { id }) => {
  const cat = await getCatalogue(db);
  const card = buildCard(cat, id!);
  if (!card) throw new ApiError("NOT_FOUND", "Unknown recording");
  const neighbours = (cat.adjacency.get(id!) ?? [])
    .map((a) => ({
      relation: a.edge.relationType,
      provenance: a.edge.provenance,
      weight: a.edge.weight,
      card: buildCard(cat, a.to),
    }))
    .filter((n) => n.card);
  return {
    card,
    player: playerConfigForSource(card.source),
    players: card.sources.map((s) => ({ source: s, player: playerConfigForSource(s) })),
    neighbours,
    curations: (cat.recordingCurations.get(id!) ?? [])
      .map((c) => cat.curations.get(c))
      .filter(Boolean),
  };
});
