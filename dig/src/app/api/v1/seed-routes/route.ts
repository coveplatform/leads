import { route } from "@/lib/api/handler";
import { seedRoutes } from "@/features/discovery/service";
export const dynamic = "force-dynamic";
export const GET = route(async ({ db }) => seedRoutes(db));
