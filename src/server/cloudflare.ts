import type {SessionsByDevice, WebVitals} from '../types'
import {WebVitalsError} from './errors'
import {metric, rateCls, rateInp, rateLcp} from './metrics'
import type {WebVitalsProvider} from './provider'

export type CloudflareWebAnalyticsOptions = {
  /** Cloudflare account ID that owns the Web Analytics site. */
  accountId: string
  /** API token with Account › Account Analytics › Read. */
  apiToken: string
  /** The site's hostname as Web Analytics records it, e.g. `www.example.com`. */
  host: string
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Defaults to Cloudflare's GraphQL Analytics API. */
  endpoint?: string
}

type Quantiles = {
  largestContentfulPaintP75: number | null
  interactionToNextPaintP75: number | null
  cumulativeLayoutShiftP75: number | null
}

type GroupsRow = {
  count: number
  sum?: {visits?: number | null}
  quantiles?: Quantiles
  dimensions?: {deviceType?: string | null; datetimeHour?: string}
}

type AccountRows = Record<string, GroupsRow[] | undefined>

type GraphqlPayload = {
  data?: {
    viewer?: {
      // `current`, `previous`, plus one `device<N>` alias per sessions window.
      accounts?: AccountRows[]
    }
  }
  errors?: Array<{message: string}>
}

const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

/*
 * Adaptive datasets pick a sample rate per query, and on a low-traffic host a multi-day sessions
 * query can come back sampled (~1 in 11 on 2026-11-04): counts become scaled estimates and small
 * groups, such as every mobile visit, disappear. One-day windows came back unsampled and their sum
 * matched the 7-day total exactly, so sessions are counted per day and summed. Percentiles cannot
 * be summed, so the vitals stay one query over the whole range.
 */
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

function sessionWindows(start: Date, end: Date) {
  const windows: Array<{start: Date; end: Date}> = []
  for (let from = start.getTime(); from < end.getTime(); from += SESSION_WINDOW_MS) {
    windows.push({
      start: new Date(from),
      end: new Date(Math.min(from + SESSION_WINDOW_MS, end.getTime())),
    })
  }
  return windows
}

/*
 * The CLS sparkline: one P75 per bucket, computed by Cloudflare for that bucket (percentiles cannot
 * be averaged from coarser rows). Today is one query grouped by hour. 7d and 30d reuse the sessions
 * windows, one query each: checked on 2026-11-09, a single 30-day query came back sampled about 1 in
 * 10 for every day and lost a 0.191 day that the unsampled 7-day query showed, while one-day windows
 * came back unsampled for the last week (older days are stored sampled however they are queried).
 */
// Cloudflare's schema uses the custom `string` scalar (not GraphQL's `String`).
function buildQuery(windowCount: number, hourly: boolean) {
  const indexes = Array.from({length: windowCount}, (_, index) => index)
  const vitals = (alias: string, start: string, end: string) => `
      ${alias}: rumWebVitalsEventsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: ${start}, datetime_leq: ${end}, requestHost: $host }
      ) {
        count
        quantiles {
          largestContentfulPaintP75
          interactionToNextPaintP75
          cumulativeLayoutShiftP75
        }
      }`
  // A window's end is the next window's start, so `lt` keeps boundary events from counting twice.
  const devices = (index: number) => `
      device${index}: rumPageloadEventsAdaptiveGroups(
        limit: 10
        orderBy: [count_DESC]
        filter: {
          datetime_geq: $deviceStart${index}
          datetime_${index === windowCount - 1 ? 'leq' : 'lt'}: $deviceEnd${index}
          requestHost: $host
        }
      ) {
        count
        sum { visits }
        dimensions { deviceType }
      }`

  const clsHourly = `
      clsHourly: rumWebVitalsEventsAdaptiveGroups(
        limit: 25
        orderBy: [datetimeHour_ASC]
        filter: { datetime_geq: $start, datetime_leq: $end, requestHost: $host }
      ) {
        dimensions { datetimeHour }
        quantiles { cumulativeLayoutShiftP75 }
      }`
  return `
query WebVitals(
  $acct: string!
  $start: Time!
  $end: Time!
  $prevStart: Time!
  $prevEnd: Time!
  $host: string!
  ${indexes.map((index) => `$deviceStart${index}: Time!\n  $deviceEnd${index}: Time!`).join('\n  ')}
) {
  viewer {
    accounts(filter: { accountTag: $acct }) {${vitals('current', '$start', '$end')}${vitals(
      'previous',
      '$prevStart',
      '$prevEnd',
    )}${hourly ? clsHourly : ''}${indexes.map(devices).join('')}
    }
  }
}
`
}

/**
 * The 7d/30d CLS series, one P75 per sessions window. Sent as its own request: with the sessions
 * windows a 30-day request goes over Cloudflare's per-request node limit.
 */
function buildClsWindowsQuery(windowCount: number) {
  const indexes = Array.from({length: windowCount}, (_, index) => index)
  const clsWindow = (index: number) => `
      cls${index}: rumWebVitalsEventsAdaptiveGroups(
        limit: 1
        filter: {
          datetime_geq: $deviceStart${index}
          datetime_${index === windowCount - 1 ? 'leq' : 'lt'}: $deviceEnd${index}
          requestHost: $host
        }
      ) {
        quantiles { cumulativeLayoutShiftP75 }
      }`

  return `
query ClsWindows(
  $acct: string!
  $host: string!
  ${indexes.map((index) => `$deviceStart${index}: Time!\n  $deviceEnd${index}: Time!`).join('\n  ')}
) {
  viewer {
    accounts(filter: { accountTag: $acct }) {${indexes.map(clsWindow).join('')}
    }
  }
}
`
}

/** One P75 per hour from `start` to `end`. Hours with no page loads are gaps. */
function hourlyClsSeries(rows: GroupsRow[] | undefined, start: Date, end: Date) {
  const byHour = new Map<string, number | null>()
  for (const row of rows ?? []) {
    const hour = row.dimensions?.datetimeHour
    if (hour) byHour.set(hour, clsValue(row.quantiles?.cumulativeLayoutShiftP75))
  }
  const series: Array<number | null> = []
  for (let time = start.getTime(); time <= end.getTime(); time += 60 * 60 * 1000) {
    series.push(byHour.get(`${new Date(time).toISOString().slice(0, 13)}:00:00Z`) ?? null)
  }
  return series
}

// RUM stores LCP/INP in microseconds; `-1` means no sample.
function usToMs(value: number | null | undefined) {
  if (value === null || value === undefined || value < 0) return null
  return Math.round(value / 1000)
}

function clsValue(value: number | null | undefined) {
  if (value === null || value === undefined || value < 0) return null
  return Math.round(value * 1000) / 1000
}

// Cloudflare "sessions"/visits = `sum.visits` (not `count`, which is page views).
function sessionsByDevice(rows: GroupsRow[] | undefined): SessionsByDevice {
  const sessions = {desktop: 0, mobile: 0, tablet: 0, other: 0}

  for (const row of rows ?? []) {
    const visits = row.sum?.visits ?? 0
    const type = (row.dimensions?.deviceType ?? '').toLowerCase()
    if (type === 'desktop') sessions.desktop += visits
    else if (type === 'mobile') sessions.mobile += visits
    else if (type === 'tablet') sessions.tablet += visits
    else sessions.other += visits
  }

  return sessions
}

/**
 * Core Web Vitals and sessions by device from Cloudflare Web Analytics (RUM), through the GraphQL
 * Analytics API. Credentials are passed in, never read from the environment, so the same provider
 * runs in a Worker, Node or any framework route.
 */
export function cloudflareWebAnalytics(options: CloudflareWebAnalyticsOptions): WebVitalsProvider {
  const {accountId, apiToken, host, endpoint = CF_GRAPHQL} = options
  const fetcher = options.fetch ?? fetch

  /** Runs one query and returns the account's aliased rows; any Cloudflare error becomes a 502. */
  async function queryAccount(query: string, variables: Record<string, string>) {
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({query, variables}),
    })

    if (!res.ok) {
      throw new WebVitalsError(502, `Cloudflare GraphQL HTTP ${res.status}`)
    }

    const payload = (await res.json()) as GraphqlPayload
    if (payload.errors?.length) {
      throw new WebVitalsError(502, payload.errors.map((e) => e.message).join('; '))
    }

    const account = payload.data?.viewer?.accounts?.[0]
    if (!account) {
      throw new WebVitalsError(502, 'No Cloudflare account data returned')
    }
    return account
  }

  return {
    name: 'cloudflare-web-analytics',
    async getWebVitals({range, windows: {start, end, prevStart, prevEnd}}): Promise<WebVitals> {
      if (!apiToken || !accountId || !host) {
        throw new WebVitalsError(
          500,
          'cloudflareWebAnalytics() needs an accountId, an apiToken and a host',
        )
      }

      const windows = sessionWindows(start, end)
      const hourly = range === 'today'

      const windowVariables = Object.fromEntries(
        windows.flatMap((window, index) => [
          [`deviceStart${index}`, window.start.toISOString()],
          [`deviceEnd${index}`, window.end.toISOString()],
        ]),
      )
      const base = {acct: accountId, host}

      const account = await queryAccount(buildQuery(windows.length, hourly), {
        ...base,
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: prevStart.toISOString(),
        prevEnd: prevEnd.toISOString(),
        ...windowVariables,
      })
      // Sequential on purpose: run alongside the main request, both came back far more heavily
      // sampled (sessions and CLS days changed from call to call); one after the other they are stable.
      const clsAccount = hourly
        ? undefined
        : await queryAccount(buildClsWindowsQuery(windows.length), {...base, ...windowVariables})

      const current = account.current?.[0]?.quantiles
      const previous = account.previous?.[0]?.quantiles

      const lcp = usToMs(current?.largestContentfulPaintP75)
      const inp = usToMs(current?.interactionToNextPaintP75)
      const cls = clsValue(current?.cumulativeLayoutShiftP75)

      return {
        range,
        lcp: metric('ms', lcp, usToMs(previous?.largestContentfulPaintP75), rateLcp(lcp)),
        inp: metric('ms', inp, usToMs(previous?.interactionToNextPaintP75), rateInp(inp)),
        cls: {
          ...metric('score', cls, clsValue(previous?.cumulativeLayoutShiftP75), rateCls(cls)),
          // A window with no page loads has no row; one without a CLS sample returns -1. Both are gaps.
          series: clsAccount
            ? windows.map((_, index) =>
                clsValue(clsAccount[`cls${index}`]?.[0]?.quantiles?.cumulativeLayoutShiftP75),
              )
            : hourlyClsSeries(account.clsHourly, start, end),
        },
        sessionsByDevice: sessionsByDevice(
          windows.flatMap((_, index) => account[`device${index}`] ?? []),
        ),
      }
    },
  }
}
