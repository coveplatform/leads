import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ready } from "@/lib/db/bootstrap";
import type { Db } from "@/lib/db/client";
import { ApiError, STATUS } from "./errors";
import {
  GUEST_COOKIE,
  guestCookieHeader,
  hashToken,
  mintGuestToken,
  readCookie,
  verifyGuestToken,
} from "@/lib/auth/guest";
import { ensurePrincipal, type Principal } from "@/features/identity/service";
import { rateLimit } from "./rate-limit";

export interface Ctx {
  db: Db;
  principal: Principal;
  requestId: string;
  req: Request;
  url: URL;
  /** Set when a brand-new guest token was minted and must be sent back. */
  setCookie?: string;
}

type Handler = (ctx: Ctx, params: Record<string, string>) => Promise<unknown>;

export function envelope(data: unknown, requestId: string, init?: ResponseInit): Response {
  return Response.json({ data, error: null, requestId }, init);
}

export function errorResponse(
  code: keyof typeof STATUS,
  message: string,
  requestId: string,
  details?: unknown,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { data: null, error: { code, message, details: details ?? null }, requestId },
    { status: STATUS[code], headers },
  );
}

export async function readJson<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION", "Body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("VALIDATION", "Invalid request", parsed.error.flatten());
  return parsed.data as z.output<S>;
}

/**
 * Wraps a route: boots the DB, resolves (or mints) the guest principal,
 * applies a per-principal rate limit, and shapes every response in the
 * `{data, error, requestId}` envelope. Cookies are read from the request
 * header directly so the same handler runs under Next.js and in tests.
 */
export function route(handler: Handler, opts: { createGuest?: boolean } = {}) {
  return async (
    req: Request,
    context?: { params?: Promise<Record<string, string>> | Record<string, string> },
  ): Promise<Response> => {
    const requestId = randomUUID();
    const headers = new Headers();
    try {
      const db = await ready();
      const params = (await context?.params) ?? {};
      const existing = verifyGuestToken(readCookie(req.headers.get("cookie"), GUEST_COOKIE));
      let token = existing;
      let setCookie: string | undefined;
      if (!token) {
        if (opts.createGuest === false) throw new ApiError("UNAUTHENTICATED", "No session");
        token = mintGuestToken();
        setCookie = guestCookieHeader(token);
      }
      const principal = await ensurePrincipal(db, hashToken(token));
      const rl = rateLimit(principal.id);
      if (!rl.ok)
        return errorResponse("RATE_LIMIT", "Slow down a little", requestId, null, {
          "retry-after": String(rl.retryAfter),
        });
      const ctx: Ctx = { db, principal, requestId, req, url: new URL(req.url), setCookie };
      const data = await handler(ctx, params);
      if (setCookie) headers.append("set-cookie", setCookie);
      if (data instanceof Response) return data;
      return envelope(data, requestId, { headers });
    } catch (e) {
      if (e instanceof ApiError)
        return errorResponse(e.code, e.message, requestId, e.details, headers);
      console.error(`[${requestId}]`, e);
      return errorResponse(
        "INTERNAL",
        "Something went wrong on our side",
        requestId,
        null,
        headers,
      );
    }
  };
}
