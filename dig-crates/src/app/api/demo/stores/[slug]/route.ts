import { demoRepository } from "@/data/demo-repository";
import { jsonError, jsonOk, SlugSchema } from "@/lib/api-helpers";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SlugSchema.safeParse(slug).success) return jsonError(400, "Invalid store slug");
  const store = await demoRepository.getStore(slug);
  if (!store) return jsonError(404, "Store not found");
  return jsonOk({ store });
}
