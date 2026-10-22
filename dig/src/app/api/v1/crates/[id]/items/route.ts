import { route, readJson } from "@/lib/api/handler";
import { addItemSchema } from "@/lib/api/schemas";
import { keepRecording, keepSource, listItems, type Sort } from "@/features/crates/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }, { id }) => {
  const p = url.searchParams;
  const view = p.get("view");
  return listItems(db, principal.id, id!, {
    sort: (p.get("sort") as Sort | null) ?? undefined,
    q: p.get("q") ?? undefined,
    view: view === "loved" || view === "to_investigate" ? view : undefined,
    limit: p.get("limit") ? Number(p.get("limit")) : undefined,
    cursor: p.get("cursor"),
  });
});
export const POST = route(async ({ db, principal, req }, { id }) => {
  const body = await readJson(req, addItemSchema);
  if (body.recordingId)
    return keepRecording(db, principal.id, body.recordingId, {
      crateId: id!,
      notes: body.notes,
      loved: body.loved,
    });
  return keepSource(db, principal.id, body.sourceId!, { crateId: id!, notes: body.notes });
});
