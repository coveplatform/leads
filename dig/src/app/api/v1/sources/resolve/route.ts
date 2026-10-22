import { route, readJson } from "@/lib/api/handler";
import { resolveSchema } from "@/lib/api/schemas";
import { submitImports } from "@/features/imports/service";
export const dynamic = "force-dynamic";
/** Resolve one URL: creates an import record so nothing pasted is ever lost. */
export const POST = route(async ({ db, principal, req }) => {
  const { url } = await readJson(req, resolveSchema);
  const [result] = await submitImports(db, principal.id, [url]);
  return result;
});
