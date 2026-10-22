import { route } from "@/lib/api/handler";
import { exportCrates } from "@/features/crates/service";
import { listDigs } from "@/features/discovery/service";
import { listImports } from "@/features/imports/service";
import { getProfile, tasteSummary } from "@/features/taste/service";
import { getCatalogue } from "@/lib/catalogue/graph";
export const dynamic = "force-dynamic";
async function build(db: Parameters<typeof getProfile>[0], principalId: string) {
  const cat = await getCatalogue(db);
  const crates = JSON.parse((await exportCrates(db, principalId, "json")).body) as unknown;
  const digs = await listDigs(db, principalId, { limit: 50, includeArchived: true });
  return {
    exportedAt: new Date().toISOString(),
    profile: await getProfile(db, principalId),
    taste: await tasteSummary(db, cat, principalId),
    crates,
    sessions: digs.sessions,
    imports: await listImports(db, principalId),
  };
}
export const GET = route(
  async ({ db, principal }) =>
    new Response(JSON.stringify(await build(db, principal.id), null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="dig-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    }),
);
export const POST = GET;
