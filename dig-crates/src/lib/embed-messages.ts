import { z } from "zod";

/**
 * postMessage protocol between the host launcher (parent) and the DIG iframe (child).
 * Both sides validate namespace, version, structure, origin and source window.
 */

export const DIG_MESSAGE_NAMESPACE = "dig-crates";
export const DIG_MESSAGE_VERSION = 1;

const slug = z.string().regex(/^[a-z0-9-]{1,64}$/);

const base = z.object({
  namespace: z.literal(DIG_MESSAGE_NAMESPACE),
  version: z.literal(DIG_MESSAGE_VERSION),
  storeSlug: slug,
});

/** Messages the embedded app sends to the host. */
export const ChildMessageSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("READY") }),
  base.extend({ type: z.literal("REQUEST_CLOSE") }),
  base.extend({ type: z.literal("RESIZE"), height: z.number().int().min(200).max(4000) }),
  base.extend({ type: z.literal("OPEN_DEMO_PRODUCT"), recordId: z.string().regex(/^[a-z0-9-]{1,64}$/) }),
]);
export type ChildMessage = z.infer<typeof ChildMessageSchema>;

/** Messages the host sends to the embedded app. */
export const ParentMessageSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("FOCUS") }),
  base.extend({ type: z.literal("HOST_CLOSING") }),
]);
export type ParentMessage = z.infer<typeof ParentMessageSchema>;

export function buildChildMessage<T extends ChildMessage["type"]>(
  type: T,
  storeSlug: string,
  extra: Omit<Extract<ChildMessage, { type: T }>, "namespace" | "version" | "storeSlug" | "type">,
): Extract<ChildMessage, { type: T }> {
  return { namespace: DIG_MESSAGE_NAMESPACE, version: DIG_MESSAGE_VERSION, storeSlug, type, ...extra } as Extract<ChildMessage, { type: T }>;
}

export function parseParentMessage(data: unknown): ParentMessage | null {
  const parsed = ParentMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function parseChildMessage(data: unknown): ChildMessage | null {
  const parsed = ChildMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export interface OriginPolicy {
  /** Origins configured for the store. */
  allowedEmbedOrigins: string[];
  /** The DIG app's own origin (demo host pages live here). */
  selfOrigin: string;
  /** Whether localhost origins are accepted (local development). */
  allowLocalhost: boolean;
}

/** Is `origin` an acceptable parent for this store's embed? */
export function isAllowedParentOrigin(origin: string | null | undefined, policy: OriginPolicy): boolean {
  if (!origin || origin === "null") return false;
  if (origin === policy.selfOrigin) return true;
  if (policy.allowedEmbedOrigins.includes(origin)) return true;
  if (policy.allowLocalhost && LOCALHOST_ORIGIN.test(origin)) return true;
  return false;
}

/** Parse and normalise an origin string, returning null for anything that is not a plain http(s) origin. */
export function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Validate an inbound MessageEvent inside the iframe: it must come from the parent window
 * and from the expected origin, and the payload must match the schema.
 */
export function validateInboundParentMessage(
  event: { data: unknown; origin: string; source: unknown },
  expectedOrigin: string | null,
  parentWindow: unknown,
  storeSlug: string,
): ParentMessage | null {
  if (!expectedOrigin || event.origin !== expectedOrigin) return null;
  if (event.source !== parentWindow) return null;
  const message = parseParentMessage(event.data);
  if (!message || message.storeSlug !== storeSlug) return null;
  return message;
}
