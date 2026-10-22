import { route, readJson } from "@/lib/api/handler";
import { patchImportSchema } from "@/lib/api/schemas";
import { deleteImport, patchImport } from "@/features/imports/service";
export const dynamic = "force-dynamic";
export const PATCH = route(async ({ db, principal, req }, { id }) =>
  patchImport(db, principal.id, id!, await readJson(req, patchImportSchema)),
);
export const DELETE = route(async ({ db, principal }, { id }) => {
  await deleteImport(db, principal.id, id!);
  return { deleted: true };
});
