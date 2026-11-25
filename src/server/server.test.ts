/* global RequestInit -- a DOM type, which ESLint does not know */
import {describe, expect, test} from 'vitest'

import {
  cloudflareWebAnalytics,
  createWebVitalsHandler,
  getWindows,
  startOfDayInTimeZone,
  type WebVitals,
  WebVitalsError,
  type WebVitalsProvider,
} from './index'

const sample: WebVitals = {
  range: '7d',
  lcp: {value: 2000, unit: 'ms', changePercent: null, rating: 'good'},
  inp: {value: 100, unit: 'ms', changePercent: null, rating: 'good'},
  cls: {value: 0.05, unit: 'score', changePercent: null, rating: 'good', series: []},
  sessionsByDevice: {desktop: 1, mobile: 2, tablet: 0, other: 0},
}

const fixed: WebVitalsProvider = {
  name: 'fixed',
  getWebVitals: async ({range}) => ({...sample, range}),
}

describe('createWebVitalsHandler', () => {
  test('returns the provider result as JSON with cache headers', async () => {
    const handler = createWebVitalsHandler({provider: fixed})
    const res = await handler(new Request('https://x.test/api/web-vitals?range=today'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    expect(((await res.json()) as WebVitals).range).toBe('today')
  })

  test('uses the default range when none is given', async () => {
    const handler = createWebVitalsHandler({provider: fixed, defaultRange: '7d'})
    const res = await handler(new Request('https://x.test/api/web-vitals'))
    expect(((await res.json()) as WebVitals).range).toBe('7d')
  })

  test('rejects an unknown range with 400', async () => {
    const res = await createWebVitalsHandler({provider: fixed})(
      new Request('https://x.test/?range=1y'),
    )
    expect(res.status).toBe(400)
  })

  test('rejects other methods with 405', async () => {
    const res = await createWebVitalsHandler({provider: fixed})(
      new Request('https://x.test/', {method: 'POST'}),
    )
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  test('maps a WebVitalsError to its status', async () => {
    const failing: WebVitalsProvider = {
      name: 'failing',
      getWebVitals: async () => {
        throw new WebVitalsError(502, 'upstream')
      },
    }
    const res = await createWebVitalsHandler({provider: failing})(new Request('https://x.test/'))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({message: 'upstream'})
  })
})

describe('cloudflareWebAnalytics', () => {
  test('500s without credentials, before calling Cloudflare', async () => {
    let called = false
    const provider = cloudflareWebAnalytics({
      accountId: '',
      apiToken: '',
      host: '',
      fetch: (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    const res = await createWebVitalsHandler({provider})(new Request('https://x.test/'))
    expect(res.status).toBe(500)
    expect(called).toBe(false)
  })

  test('maps RUM rows to the response shape', async () => {
    const bodies: Array<{query: string; variables: Record<string, string>}> = []
    const provider = cloudflareWebAnalytics({
      accountId: 'acct',
      apiToken: 'token',
      host: 'www.example.com',
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        bodies.push(body)
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
        const account = body.query.includes('query ClsWindows')
          ? {cls0: [{quantiles: {cumulativeLayoutShiftP75: 0.12}}]}
          : {
              current: [
                {
                  count: 10,
                  quantiles: {
                    largestContentfulPaintP75: 2_600_000,
                    interactionToNextPaintP75: 150_000,
                    cumulativeLayoutShiftP75: 0.05,
                  },
                },
              ],
              previous: [
                {
                  count: 10,
                  quantiles: {
                    largestContentfulPaintP75: 2_000_000,
                    interactionToNextPaintP75: -1,
                    cumulativeLayoutShiftP75: 0.1,
                  },
                },
              ],
              device0: [
                {count: 5, sum: {visits: 3}, dimensions: {deviceType: 'desktop'}},
                {count: 4, sum: {visits: 2}, dimensions: {deviceType: 'Mobile'}},
                {count: 1, sum: {visits: 1}, dimensions: {deviceType: 'smarttv'}},
              ],
            }
        return Response.json({data: {viewer: {accounts: [account]}}})
      }) as unknown as typeof fetch,
    })

    const now = new Date('2026-11-20T12:00:00Z')
    const data = await provider.getWebVitals({
      range: '7d',
      windows: getWindows('7d', 'UTC', now),
      timeZone: 'UTC',
    })

    expect(bodies).toHaveLength(2)
    expect(bodies[0].variables.host).toBe('www.example.com')
    expect(data.lcp).toEqual({
      value: 2600,
      unit: 'ms',
      changePercent: 30,
      rating: 'needs-improvement',
    })
    expect(data.inp).toEqual({value: 150, unit: 'ms', changePercent: null, rating: 'good'})
    expect(data.cls.value).toBe(0.05)
    expect(data.cls.changePercent).toBe(-50)
    expect(data.cls.series).toHaveLength(7)
    expect(data.cls.series?.[0]).toBe(0.12)
    expect(data.cls.series?.[1]).toBeNull()
    expect(data.sessionsByDevice).toEqual({desktop: 3, mobile: 2, tablet: 0, other: 1})
  })

  test('turns GraphQL errors into a 502', async () => {
    const provider = cloudflareWebAnalytics({
      accountId: 'acct',
      apiToken: 'token',
      host: 'h',
      fetch: (async () =>
        Response.json({errors: [{message: 'bad token'}]})) as unknown as typeof fetch,
    })
    const res = await createWebVitalsHandler({provider})(new Request('https://x.test/?range=today'))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({message: 'bad token'})
  })
})

describe('time windows', () => {
  test('today starts at local midnight and compares with yesterday so far', () => {
    const now = new Date('2026-11-09T20:48:00Z')
    const w = getWindows('today', 'America/Los_Angeles', now)
    expect(w.start.toISOString()).toBe('2026-11-09T08:00:00.000Z')
    expect(w.prevStart.toISOString()).toBe('2026-11-08T08:00:00.000Z')
    expect(w.prevEnd.toISOString()).toBe('2026-11-08T20:48:00.000Z')
  })

  test('DST start day: midnight is still PST', () => {
    expect(
      startOfDayInTimeZone(new Date('2026-03-08T20:00:00Z'), 'America/Los_Angeles').toISOString(),
    ).toBe('2026-03-08T08:00:00.000Z')
  })
})
