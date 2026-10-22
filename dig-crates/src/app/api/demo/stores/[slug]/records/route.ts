import { z } from "zod";
import { DEMO_RECORD_LIMIT_DEFAULT, DEMO_RECORD_LIMIT_MAX, demoRepository } from "@/data/demo-repository";
import { CONDITIONS, FORMATS, SORT_KEYS } from "@/domain/types";
import { jsonError, jsonOk, SlugSchema } from "@/lib/api-helpers";

const csv = (max: number) =>
  z
    .string()
    .max(400)
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, max))
    .optional();

const intParam = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional();

const QuerySchema = z.object({
  crate: z.string().max(80).optional(),
  q: z.string().max(120).optional(),
  sort: z.enum(SORT_KEYS).optional(),
  seed: z.string().max(64).optional(),
  limit: intParam(1, DEMO_RECORD_LIMIT_MAX).default(DEMO_RECORD_LIMIT_DEFAULT),
  cursor: z.string().max(32).regex(/^[A-Za-z0-9_-]*$/).optional(),
  genre: csv(20),
  style: csv(20),
  yearFrom: intParam(1900, 2100),
  yearTo: intParam(1900, 2100),
  priceMin: intParam(0, 10_000_000),
  priceMax: intParam(0, 10_000_000),
  format: csv(4),
  condition: csv(6),
  preview: z.enum(["0", "1"]).optional(),
  available: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SlugSchema.safeParse(slug).success) return jsonError(400, "Invalid store slug");
  const store = await demoRepository.getStore(slug);
  if (!store) return jsonError(404, "Store not found");

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const q = parsed.data;
  const formats = (q.format ?? []).filter((f): f is (typeof FORMATS)[number] => (FORMATS as readonly string[]).includes(f));
  const condition = (q.condition ?? []).filter((c): c is (typeof CONDITIONS)[number] => (CONDITIONS as readonly string[]).includes(c));
  if ((q.format?.length ?? 0) !== formats.length) return jsonError(400, "Invalid format value");
  if ((q.condition?.length ?? 0) !== condition.length) return jsonError(400, "Invalid condition value");

  try {
    const page = await demoRepository.listRecords(store.id, {
      crateId: q.crate ?? null,
      query: q.q,
      sort: q.sort,
      sortSeed: q.seed,
      limit: q.limit,
      cursor: q.cursor,
      filters: {
        genre: q.genre ?? [],
        style: q.style ?? [],
        yearFrom: q.yearFrom,
        yearTo: q.yearTo,
        priceMinMinor: q.priceMin,
        priceMaxMinor: q.priceMax,
        formats,
        condition,
        previewOnly: q.preview === "1",
        availableOnly: q.available === "1",
      },
    });
    return jsonOk({ items: page.items, total: page.total, nextCursor: page.nextCursor ?? null });
  } catch (err) {
    if (err instanceof RangeError) return jsonError(400, "Invalid cursor");
    throw err;
  }
}
