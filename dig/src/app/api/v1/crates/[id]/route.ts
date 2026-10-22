import { route, readJson } from "@/lib/api/handler";
import { patchCrateSchema } from "@/lib/api/schemas";
import { deleteCrate, patchCrate, requireCrate } from "@/features/crates/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal }, { id }) => requireCrate(db, principal.id, id!));
export const PATCH = route(async ({ db, principal, req }, { id }) =>
  patchCrate(db, principal.id, id!, await readJson(req, patchCrateSchema)),
);
export const DELETE = route(async ({ db, principal }, { id }) => {
  await deleteCrate(db, principal.id, id!);
  return { deleted: true };
});
