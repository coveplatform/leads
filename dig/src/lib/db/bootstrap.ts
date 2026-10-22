import { getDb, type Db } from "./client";
import { migrate } from "./migrate";
import { isSeeded, seedDemo } from "./seed";
import { invalidateCatalogue } from "@/lib/catalogue/graph";

const g = globalThis as unknown as { __digReady?: Promise<Db> };

/**
 * Migrates (and in demo mode seeds) exactly once per process. Every API
 * route awaits this, so a fresh checkout works with `npm run dev` alone.
 */
export function ready(): Promise<Db> {
  if (!g.__digReady) {
    g.__digReady = (async () => {
      const db = await getDb();
      await migrate(db);
      const autoSeed = (process.env.DIG_AUTO_SEED ?? "1") !== "0";
      if (autoSeed && !(await isSeeded(db))) {
        await seedDemo(db);
        invalidateCatalogue();
      }
      return db;
    })();
    g.__digReady.catch(() => {
      g.__digReady = undefined;
    });
  }
  return g.__digReady;
}

export function resetReadyForTests(): void {
  g.__digReady = undefined;
}
