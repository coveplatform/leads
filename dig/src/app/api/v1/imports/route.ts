import { route, readJson } from "@/lib/api/handler";
import { importsSchema } from "@/lib/api/schemas";
import { listImports, submitImports } from "@/features/imports/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }) =>
  listImports(db, principal.id, url.searchParams.get("status") ?? undefined),
);
export const POST = route(async ({ db, principal, req }) =>
  submitImports(db, principal.id, (await readJson(req, importsSchema)).urls),
);
