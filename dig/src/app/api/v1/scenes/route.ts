import { route } from "@/lib/api/handler";
import { listScenes } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db }) => listScenes(db));
