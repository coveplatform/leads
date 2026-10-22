import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonError(status: number, message: string, issues?: unknown) {
  return NextResponse.json({ error: message, issues: issues ?? undefined, isDemo: true }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: Record<string, unknown>) {
  return NextResponse.json({ ...body, isDemo: true }, { headers: { "Cache-Control": "public, max-age=60" } });
}

export const SlugSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
