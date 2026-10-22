import { route, readJson } from "@/lib/api/handler";
import { patchProfileSchema } from "@/lib/api/schemas";
import { getProfile, patchProfile } from "@/features/taste/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal }) => ({
  ...(await getProfile(db, principal.id)),
  kind: principal.kind,
}));
export const PATCH = route(async ({ db, principal, req }) =>
  patchProfile(db, principal.id, await readJson(req, patchProfileSchema)),
);
