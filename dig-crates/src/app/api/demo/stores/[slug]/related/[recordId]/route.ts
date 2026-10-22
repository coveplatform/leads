import { demoRepository } from "@/data/demo-repository";
import { jsonError, jsonOk, SlugSchema } from "@/lib/api-helpers";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string; recordId: string }> }) {
  const { slug, recordId } = await ctx.params;
  if (!SlugSchema.safeParse(slug).success || !SlugSchema.safeParse(recordId).success) return jsonError(400, "Invalid identifier");
  const store = await demoRepository.getStore(slug);
  if (!store) return jsonError(404, "Store not found");
  const seed = await demoRepository.getRecord(store.id, recordId);
  if (!seed) return jsonError(404, "Record not found in this store");
  const includeSold = new URL(req.url).searchParams.get("includeSold") === "1";
  const items = await demoRepository.related(store.id, recordId, { availableOnly: !includeSold });
  return jsonOk({ seed: { id: seed.id, artist: seed.artist, title: seed.title }, items: items.map((r) => ({ record: r.record, reasons: r.reasons })), total: items.length });
}
