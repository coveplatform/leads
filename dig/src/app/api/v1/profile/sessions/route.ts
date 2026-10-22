import { route } from "@/lib/api/handler";
import { clearSessionHistory } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
/** Clears temporary session history only; stable taste is untouched. */
export const DELETE = route(async ({ db, principal }) => ({
  cleared: await clearSessionHistory(db, principal.id),
}));
