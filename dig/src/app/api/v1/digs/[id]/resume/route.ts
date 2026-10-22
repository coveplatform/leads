import { route } from "@/lib/api/handler";
import { resumeDig } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const POST = route(async ({ db, principal }, { id }) => resumeDig(db, principal.id, id!));
