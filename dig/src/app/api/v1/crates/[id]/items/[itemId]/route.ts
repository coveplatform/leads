import { route, readJson } from "@/lib/api/handler";
import { patchItemSchema } from "@/lib/api/schemas";
import { deleteItem, patchItem } from "@/features/crates/service";
export const dynamic = "force-dynamic";
export const PATCH = route(async ({ db, principal, req }, { id, itemId }) =>
  patchItem(db, principal.id, id!, itemId!, await readJson(req, patchItemSchema)),
);
export const DELETE = route(async ({ db, principal }, { id, itemId }) => {
  await deleteItem(db, principal.id, id!, itemId!);
  return { deleted: true };
});
