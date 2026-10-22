import { route } from "@/lib/api/handler";
import { getCatalogue } from "@/lib/catalogue/graph";
import { clearStableTaste, tasteSummary } from "@/features/taste/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db, principal }) =>
  tasteSummary(db, await getCatalogue(db), principal.id),
);
export const DELETE = route(async ({ db, principal }) => {
  await clearStableTaste(db, principal.id);
  return { cleared: true };
});
