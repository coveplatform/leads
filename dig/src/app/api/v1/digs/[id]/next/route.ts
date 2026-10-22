import { route, readJson } from "@/lib/api/handler";
import { nextSchema } from "@/lib/api/schemas";
import { nextSuggestions } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal, req, url }, { id }) =>
  nextSuggestions(db, principal.id, id!, await readJson(req, nextSchema), {
    debug: url.searchParams.get("debug") === "1" && process.env.DIG_DEBUG_RANKING === "1",
  }),
);
