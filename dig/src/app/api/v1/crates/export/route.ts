import { route } from "@/lib/api/handler";
import { exportCrates } from "@/features/crates/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }) => {
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const { body, contentType, filename } = await exportCrates(
    db,
    principal.id,
    format,
    url.searchParams.get("crateId") ?? undefined,
  );
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});
