import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { recordingsByEntity } from "@/features/search/service";
import { getCatalogue } from "@/lib/catalogue/graph";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db }, { kind, id }) => {
  if (kind !== "artist" && kind !== "label" && kind !== "tag")
    throw new ApiError("NOT_FOUND", "Unknown entity kind");
  const cat = await getCatalogue(db);
  const entity =
    kind === "artist"
      ? cat.artists.get(id!)
      : kind === "label"
        ? cat.labels.get(id!)
        : (cat.tags.get(id!) ?? [...cat.tags.values()].find((t) => t.slug === id));
  if (!entity) throw new ApiError("NOT_FOUND", "Not found");
  return { kind, entity, recordings: await recordingsByEntity(db, kind, entity.id) };
});
