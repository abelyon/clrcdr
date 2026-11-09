import { ZodError, type ZodTypeAny, type z } from 'zod';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = STATUS[code];
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError('VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new ApiError('UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') => new ApiError('FORBIDDEN', message);
export const notFound = (message = 'Not found') => new ApiError('NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) =>
  new ApiError('CONFLICT', message, details);
export const unavailable = (message = 'Database is not available') =>
  new ApiError('SERVICE_UNAVAILABLE', message);

export function zodDetails(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Parses `data` with `schema`, throwing a 400 ApiError with per-field details. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Invalid request', zodDetails(result.error));
  }
  return result.data;
}

export function errorBody(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
