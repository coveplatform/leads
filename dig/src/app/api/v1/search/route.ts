import { route } from "@/lib/api/handler";
import { search } from "@/features/search/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal, url }) => {
  const p = url.searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  return search(db, principal.id, p.get("q") ?? "", {
    type: p.get("type") ?? undefined,
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    limit: num("limit"),
    tag: p.get("tag") ?? undefined,
    playable: p.get("playable") === "1",
  });
});
