import type { Request } from 'express'

/**
 * Type-safe access to Express `req.params` route parameters.
 *
 * Express types `req.params[k]` as `string | undefined` because the
 * ParamsDictionary signature is keyed dynamically. Every route in this
 * codebase was previously doing `req.params.id as string` or
 * `id as string` after a destructure, which silently widens the undefined
 * away. If a route file someday declares the path as `/:id?` (optional
 * param) or the middleware chain skips param parsing, the runtime sees
 * undefined and downstream code crashes.
 *
 * `requireParam` throws a typed Error with statusCode=400 if missing, so
 * the global error handler (api/src/app.ts) returns JSON 400 instead of
 * the default Express HTML.
 */
export function requireParam(req: Request, key: string): string {
  const value = req.params[key]
  if (typeof value !== 'string' || value === '') {
    throw Object.assign(new Error(`Missing required route parameter: ${key}`), {
      statusCode: 400,
    })
  }
  return value
}

/**
 * Type-safe access to Express `req.query` string parameters.
 *
 * Express types `req.query[k]` as `string | string[] | ParsedQs | ParsedQs[] | undefined`.
 * Every route in this codebase was previously doing `req.query.X as string`, which
 * silently widens away the array / undefined cases and would crash at runtime on
 * `parseInt(undefined, 10)` (returns NaN, downstream queries silently misbehave).
 *
 * Use these helpers at the top of each handler to either get a guaranteed string
 * (with a sensible 400 fallback) or an explicitly optional one.
 */

export function optionalQueryString(req: Request, key: string): string | undefined {
  const value = req.query[key]
  if (typeof value === 'string') return value
  return undefined
}

export function requireQueryString(req: Request, key: string): string {
  const value = optionalQueryString(req, key)
  if (value === undefined || value === '') {
    throw Object.assign(new Error(`Missing required query parameter: ${key}`), {
      statusCode: 400,
    })
  }
  return value
}

/**
 * Parse a query param as int with bounds. Returns the parsed number, or the
 * fallback if missing/non-numeric.
 */
export function queryInt(
  req: Request,
  key: string,
  fallback: number,
  opts: { min?: number; max?: number } = {}
): number {
  const raw = optionalQueryString(req, key)
  if (raw === undefined) return fallback
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return fallback
  if (opts.min !== undefined && n < opts.min) return opts.min
  if (opts.max !== undefined && n > opts.max) return opts.max
  return n
}
