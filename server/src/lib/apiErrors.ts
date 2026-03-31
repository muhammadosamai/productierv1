export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR'

export interface ApiErrorResponse {
  error: string
  code: ApiErrorCode
  details?: unknown
}

export interface RouteSet {
  status?: number | string
}

export class ApiHttpError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function withDetails(
  payload: ApiErrorResponse,
  details?: unknown
): ApiErrorResponse {
  if (details === undefined) return payload
  return { ...payload, details }
}

export function apiError(
  set: RouteSet | undefined,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ApiErrorResponse {
  if (set) set.status = status
  return withDetails({ error: message, code }, details)
}

export function badRequest(
  set: RouteSet | undefined,
  message = 'Bad request',
  details?: unknown
): ApiErrorResponse {
  return apiError(set, 400, 'BAD_REQUEST', message, details)
}

export function validationError(
  set: RouteSet | undefined,
  message = 'Validation failed',
  details?: unknown
): ApiErrorResponse {
  return apiError(set, 400, 'VALIDATION_ERROR', message, details)
}

export function unauthorized(
  set: RouteSet | undefined,
  message = 'Unauthorized'
): ApiErrorResponse {
  return apiError(set, 401, 'UNAUTHORIZED', message)
}

export function forbidden(
  set: RouteSet | undefined,
  message = 'Forbidden'
): ApiErrorResponse {
  return apiError(set, 403, 'FORBIDDEN', message)
}

export function notFound(
  set: RouteSet | undefined,
  message = 'Not found'
): ApiErrorResponse {
  return apiError(set, 404, 'NOT_FOUND', message)
}

export function conflict(
  set: RouteSet | undefined,
  message = 'Conflict'
): ApiErrorResponse {
  return apiError(set, 409, 'CONFLICT', message)
}

export function internalError(
  set: RouteSet | undefined,
  message = 'Internal server error'
): ApiErrorResponse {
  return apiError(set, 500, 'INTERNAL_ERROR', message)
}

export function inferCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    default:
      return 'INTERNAL_ERROR'
  }
}

export function inferStatusFromCode(code: string): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return 409
    case 'VALIDATION_ERROR':
    case 'BAD_REQUEST':
      return 400
    default:
      return 500
  }
}

export function isApiHttpError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError
}
