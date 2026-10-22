import { resetDbForTests } from "@/lib/db/client";
import { resetReadyForTests } from "@/lib/db/bootstrap";
import { invalidateCatalogue } from "@/lib/catalogue/graph";
import { mintGuestToken } from "@/lib/auth/guest";

export async function freshApp() {
  process.env.DIG_DB = "memory";
  process.env.DIG_PROVIDER_NETWORK = "0";
  process.env.DIG_AUTO_SEED = "1";
  invalidateCatalogue();
  resetReadyForTests();
  await resetDbForTests();
}

export interface Client {
  cookie: string;
  call<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<{
    status: number;
    data: T;
    error: { code: string; message: string } | null;
    raw: Response;
  }>;
}

type RouteModule = { GET?: Handler; POST?: Handler; PATCH?: Handler; DELETE?: Handler };
type Handler = (req: Request, ctx?: { params?: Record<string, string> }) => Promise<Response>;

/** Dispatches to the real route handlers (no HTTP server) with a persistent guest cookie. */
export function makeClient(): Client {
  const token = mintGuestToken();
  const cookie = `dig_guest=${encodeURIComponent(token)}`;
  return {
    cookie,
    async call<T = unknown>(
      method: string,
      path: string,
      body?: unknown,
      query?: Record<string, string>,
    ) {
      const url = new URL(`http://dig.test/api/v1${path}`);
      for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
      const { mod, params } = await resolveRoute(path);
      const handler = mod[method as keyof RouteModule];
      if (!handler) throw new Error(`No ${method} for ${path}`);
      const req = new Request(url, {
        method,
        headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const res = await handler(req, { params });
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const json = ct.includes("json")
        ? (JSON.parse(text) as { data?: unknown; error?: unknown })
        : { data: text, error: null };
      const isEnvelope = json && typeof json === "object" && "error" in json && "data" in json;
      return {
        status: res.status,
        data: (isEnvelope ? json.data : text) as T,
        error: (isEnvelope ? json.error : null) as { code: string; message: string } | null,
        raw: res,
      };
    },
  };
}

const ROUTES: Array<[RegExp, () => Promise<RouteModule>, string[]]> = [
  [/^\/health$/, () => import("@/app/api/v1/health/route"), []],
  [/^\/scenes$/, () => import("@/app/api/v1/scenes/route"), []],
  [/^\/seed-routes$/, () => import("@/app/api/v1/seed-routes/route"), []],
  [/^\/sources\/resolve$/, () => import("@/app/api/v1/sources/resolve/route"), []],
  [/^\/search$/, () => import("@/app/api/v1/search/route"), []],
  [/^\/digs$/, () => import("@/app/api/v1/digs/route"), []],
  [/^\/digs\/([^/]+)\/next$/, () => import("@/app/api/v1/digs/[id]/next/route"), ["id"]],
  [/^\/digs\/([^/]+)\/action$/, () => import("@/app/api/v1/digs/[id]/action/route"), ["id"]],
  [/^\/digs\/([^/]+)\/fork$/, () => import("@/app/api/v1/digs/[id]/fork/route"), ["id"]],
  [/^\/digs\/([^/]+)\/resume$/, () => import("@/app/api/v1/digs/[id]/resume/route"), ["id"]],
  [/^\/digs\/([^/]+)$/, () => import("@/app/api/v1/digs/[id]/route"), ["id"]],
  [/^\/crates$/, () => import("@/app/api/v1/crates/route"), []],
  [/^\/crates\/export$/, () => import("@/app/api/v1/crates/export/route"), []],
  [
    /^\/crates\/([^/]+)\/items\/([^/]+)$/,
    () => import("@/app/api/v1/crates/[id]/items/[itemId]/route"),
    ["id", "itemId"],
  ],
  [/^\/crates\/([^/]+)\/items$/, () => import("@/app/api/v1/crates/[id]/items/route"), ["id"]],
  [/^\/crates\/([^/]+)$/, () => import("@/app/api/v1/crates/[id]/route"), ["id"]],
  [/^\/imports$/, () => import("@/app/api/v1/imports/route"), []],
  [
    /^\/imports\/([^/]+)\/confirm$/,
    () => import("@/app/api/v1/imports/[id]/confirm/route"),
    ["id"],
  ],
  [/^\/imports\/([^/]+)$/, () => import("@/app/api/v1/imports/[id]/route"), ["id"]],
  [/^\/profile$/, () => import("@/app/api/v1/profile/route"), []],
  [/^\/profile\/taste$/, () => import("@/app/api/v1/profile/taste/route"), []],
  [/^\/profile\/export$/, () => import("@/app/api/v1/profile/export/route"), []],
  [/^\/profile\/delete$/, () => import("@/app/api/v1/profile/delete/route"), []],
  [/^\/profile\/sessions$/, () => import("@/app/api/v1/profile/sessions/route"), []],
  [
    /^\/entities\/([^/]+)\/([^/]+)$/,
    () => import("@/app/api/v1/entities/[kind]/[id]/route"),
    ["kind", "id"],
  ],
  [/^\/recordings\/([^/]+)$/, () => import("@/app/api/v1/recordings/[id]/route"), ["id"]],
];

async function resolveRoute(
  path: string,
): Promise<{ mod: RouteModule; params: Record<string, string> }> {
  for (const [re, load, names] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    const params: Record<string, string> = {};
    names.forEach((n, i) => (params[n] = m[i + 1]!));
    return { mod: (await load()) as RouteModule, params };
  }
  throw new Error(`No route for ${path}`);
}
