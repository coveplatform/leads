import { demoRepository } from "@/data/demo-repository";
import { countForCrate } from "@/domain/catalog";
import { jsonError, jsonOk, SlugSchema } from "@/lib/api-helpers";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SlugSchema.safeParse(slug).success) return jsonError(400, "Invalid store slug");
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) return jsonError(404, "Store not found");
  const items = snapshot.crates.map((c) => ({ ...c, recordCount: countForCrate(snapshot.records, c) }));
  return jsonOk({ items, total: items.length });
}
