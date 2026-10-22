import { route, readJson } from "@/lib/api/handler";
import { deleteSchema } from "@/lib/api/schemas";
import { deletePrincipal } from "@/features/identity/service";
import { clearGuestCookieHeader } from "@/lib/auth/guest";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal, req, requestId }) => {
  await readJson(req, deleteSchema);
  await deletePrincipal(db, principal.id);
  return Response.json(
    { data: { deleted: true, completedAt: new Date().toISOString() }, error: null, requestId },
    { headers: { "set-cookie": clearGuestCookieHeader() } },
  );
});
