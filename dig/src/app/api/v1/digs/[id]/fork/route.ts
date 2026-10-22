import { route, readJson } from "@/lib/api/handler";
import { forkSchema } from "@/lib/api/schemas";
import { forkDig } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal, req }, { id }) =>
  forkDig(db, principal.id, id!, await readJson(req, forkSchema)),
);
