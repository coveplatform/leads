import { route, readJson } from "@/lib/api/handler";
import { createDigSchema } from "@/lib/api/schemas";
import { createDig, listDigs } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }) =>
  listDigs(db, principal.id, {
    limit: Number(url.searchParams.get("limit") ?? 20),
    cursor: url.searchParams.get("cursor"),
    includeArchived: url.searchParams.get("archived") === "1",
  }),
);
export const POST = route(async ({ db, principal, req, url }) => {
  const body = await readJson(req, createDigSchema);
  return createDig(db, principal.id, body, {
    debug: url.searchParams.get("debug") === "1" && process.env.DIG_DEBUG_RANKING === "1",
  });
});
