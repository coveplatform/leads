import { route, readJson } from "@/lib/api/handler";
import { actionSchema } from "@/lib/api/schemas";
import { applyAction } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal, req }, { id }) =>
  applyAction(db, principal.id, id!, await readJson(req, actionSchema)),
);
