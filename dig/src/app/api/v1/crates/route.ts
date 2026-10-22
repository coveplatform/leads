import { route, readJson } from "@/lib/api/handler";
import { createCrateSchema } from "@/lib/api/schemas";
import { createCrate, listCrates } from "@/features/crates/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal }) => listCrates(db, principal.id));
export const POST = route(async ({ db, principal, req }) =>
  createCrate(db, principal.id, await readJson(req, createCrateSchema)),
);
