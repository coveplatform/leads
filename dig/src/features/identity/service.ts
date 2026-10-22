import type { Db } from "@/lib/db/client";

export interface Principal {
  id: string;
  kind: "guest" | "user";
}

export async function ensurePrincipal(db: Db, guestTokenHash: string): Promise<Principal> {
  const found = await db.query<{ id: string; kind: "guest" | "user" }>(
    "SELECT id, kind FROM principals WHERE guest_token_hash = $1",
    [guestTokenHash],
  );
  if (found.rows[0]) {
    void db
      .query("UPDATE principals SET last_seen_at = now() WHERE id = $1", [found.rows[0].id])
      .catch(() => undefined);
    return found.rows[0];
  }
  const created = await db.query<{ id: string; kind: "guest" | "user" }>(
    `INSERT INTO principals (kind, guest_token_hash) VALUES ('guest', $1)
     ON CONFLICT (guest_token_hash) DO UPDATE SET last_seen_at = now() RETURNING id, kind`,
    [guestTokenHash],
  );
  const p = created.rows[0]!;
  await db.query("INSERT INTO profiles (principal_id) VALUES ($1) ON CONFLICT DO NOTHING", [p.id]);
  await db.query(
    `INSERT INTO crates (principal_id, title, description, is_system, system_key) VALUES ($1, 'All Finds', 'Everything you keep lands here first.', true, 'all_finds')
     ON CONFLICT DO NOTHING`,
    [p.id],
  );
  return p;
}

export async function deletePrincipal(db: Db, principalId: string): Promise<void> {
  await db.query("DELETE FROM principals WHERE id = $1", [principalId]);
}
