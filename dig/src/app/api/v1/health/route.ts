import { ready } from "@/lib/db/bootstrap";
import { getCatalogue } from "@/lib/catalogue/graph";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await ready();
    const cat = await getCatalogue(db);
    return Response.json({
      data: {
        ok: true,
        backend: db.backend,
        recordings: cat.recordings.size,
        edges: [...cat.adjacency.values()].reduce((n, a) => n + a.length, 0) / 2,
      },
      error: null,
      requestId: "health",
    });
  } catch (e) {
    return Response.json(
      {
        data: null,
        error: { code: "INTERNAL", message: e instanceof Error ? e.message : "boot failed" },
        requestId: "health",
      },
      { status: 500 },
    );
  }
}
