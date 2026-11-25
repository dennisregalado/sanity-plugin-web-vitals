import {isRange, type Range, RANGES} from '../types'
import {WebVitalsError} from './errors'
import type {WebVitalsProvider} from './provider'
import {getWindows} from './time'

export type WebVitalsHandlerOptions = {
  provider: WebVitalsProvider
  /** IANA time zone "today" is measured in, e.g. `America/Los_Angeles`. Defaults to `UTC`. */
  timeZone?: string
  /** Range used when the request has no `?range=`. Defaults to `30d`. */
  defaultRange?: Range
  /** `Cache-Control` on successful responses. Defaults to `public, max-age=60`; `false` sends none. */
  cacheControl?: string | false
}

/**
 * A Web-standard `(Request) => Promise<Response>` for `GET ?range=today|7d|30d`, so it mounts as is
 * in Next.js route handlers, Workers, Hono or Bun, and as `({ request }) => handler(request)` in
 * SvelteKit. Errors come back as JSON `{ message }` with their status.
 */
export function createWebVitalsHandler(options: WebVitalsHandlerOptions) {
  const {
    provider,
    timeZone = 'UTC',
    defaultRange = '30d',
    cacheControl = 'public, max-age=60',
  } = options

  return async function handleWebVitals(request: Request): Promise<Response> {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new WebVitalsError(405, 'Method not allowed')
      }

      const range = new URL(request.url).searchParams.get('range') ?? defaultRange
      if (!isRange(range)) {
        throw new WebVitalsError(400, `Invalid range. Expected one of: ${RANGES.join(', ')}`)
      }

      const body = await provider.getWebVitals({
        range,
        windows: getWindows(range, timeZone),
        timeZone,
      })

      return Response.json(body, {
        headers: cacheControl ? {'cache-control': cacheControl} : undefined,
      })
    } catch (err) {
      const status = err instanceof WebVitalsError ? err.status : 500
      const message = err instanceof Error ? err.message : 'Unknown error'
      return Response.json(
        {message},
        {status, headers: status === 405 ? {allow: 'GET, HEAD'} : undefined},
      )
    }
  }
}
