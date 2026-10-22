"use client";

export class ClientApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  requestId: string;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    if (!res.ok) throw new ClientApiError("INTERNAL", `Request failed (${res.status})`);
    return (await res.text()) as unknown as T;
  }
  const body = (await res.json()) as Envelope<T>;
  if (body.error) throw new ClientApiError(body.error.code, body.error.message, body.error.details);
  return body.data;
}

export function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
