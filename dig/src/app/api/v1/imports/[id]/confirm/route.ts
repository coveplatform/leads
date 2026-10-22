import { route, readJson } from "@/lib/api/handler";
import { confirmSchema } from "@/lib/api/schemas";
import { confirmImport } from "@/features/imports/service";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal, req }, { id }) =>
  confirmImport(db, principal.id, id!, (await readJson(req, confirmSchema)).entityId),
);
