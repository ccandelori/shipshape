/**
 * Error subclass that carries an HTTP status code. Use instead of
 * `new Error('msg') as Error & { status: number }; error.status = N`,
 * which appeared at 30+ sites in the React Query hooks before this helper.
 *
 * React Query's typed retry/onError handlers can still narrow to this
 * class via `instanceof HttpError`.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}
