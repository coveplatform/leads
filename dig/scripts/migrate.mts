import "./_env.mts";
import { createDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";

const db = await createDb();
const ran = await migrate(db);
console.log(
  `[${db.backend}] applied ${ran.length} migration(s)${ran.length ? ": " + ran.join(", ") : ""}`,
);
await db.close();
