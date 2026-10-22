import "./_env.mts";
import { createDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";
import { seedDemo } from "../src/lib/db/seed";

const db = await createDb();
await migrate(db);
const { recordings, edges } = await seedDemo(db);
console.log(`[${db.backend}] seeded demo catalogue: ${recordings} recordings, ${edges} edges`);
await db.close();
