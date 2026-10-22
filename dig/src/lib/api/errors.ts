export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "SOURCE_UNPLAYABLE"
  | "RATE_LIMIT"
  | "NO_CANDIDATES"
  | "AMBIGUOUS_MATCH"
  | "CONFLICT"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PROVIDER_UNAVAILABLE: 502,
  SOURCE_UNPLAYABLE: 409,
  RATE_LIMIT: 429,
  NO_CANDIDATES: 404,
  AMBIGUOUS_MATCH: 409,
  CONFLICT: 409,
  INTERNAL: 500,
};
