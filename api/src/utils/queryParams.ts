import type { Request } from 'express'

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
