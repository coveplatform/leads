import { route, readJson } from "@/lib/api/handler";
import { patchDigSchema } from "@/lib/api/schemas";
import { getDig, patchDig } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }, { id }) =>
  getDig(db, principal.id, id!, {
    debug: url.searchParams.get("debug") === "1" && process.env.DIG_DEBUG_RANKING === "1",
  }),
);
export const PATCH = route(async ({ db, principal, req }, { id }) =>
  patchDig(db, principal.id, id!, await readJson(req, patchDigSchema)),
);
