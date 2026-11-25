import type {Range, WebVitals} from '../types'
import type {Windows} from './time'

export type WebVitalsQuery = {
  range: Range
  /** The current and previous periods, already resolved in `timeZone`. */
  windows: Windows
  /** IANA time zone the handler was given; "today" starts at local midnight here. */
  timeZone: string
}

/**
 * Where the numbers come from. `cloudflareWebAnalytics()` is the built-in one; another source only
 * has to return the same shape. Throw a `WebVitalsError` to choose the response status.
 */
export type WebVitalsProvider = {
  name: string
  getWebVitals(query: WebVitalsQuery): Promise<WebVitals>
}
