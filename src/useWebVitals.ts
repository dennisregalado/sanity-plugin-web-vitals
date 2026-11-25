/* global RequestInit -- a DOM type, which ESLint does not know */
import {useEffect, useState} from 'react'

import type {Range, WebVitals} from './types'

/** The range menu: label, button text and the comparison shown under the strip. */
export const RANGE_OPTIONS = [
  {
    value: 'today',
    label: 'Today',
    button: 'Today',
    comparison: 'Compared to yesterday up to current hour',
  },
  {
    value: '7d',
    label: 'Last 7 days',
    button: '7 days',
    comparison: 'Compared to the previous 7 days',
  },
  {
    value: '30d',
    label: 'Last 30 days',
    button: '30 days',
    comparison: 'Compared to the previous 30 days',
  },
] as const satisfies ReadonlyArray<{
  value: Range
  label: string
  button: string
  comparison: string
}>

/** Sample numbers shown while the endpoint has no data (e.g. credentials not set). Not real traffic. */
export const SAMPLE_WEB_VITALS: Record<Range, WebVitals> = {
  today: {
    range: 'today',
    lcp: {value: 1984, unit: 'ms', changePercent: -3.1, rating: 'good'},
    inp: {value: 64, unit: 'ms', changePercent: 0, rating: 'good'},
    cls: {
      value: 0.02,
      unit: 'score',
      changePercent: -50,
      rating: 'good',
      series: [0.04, 0.03, 0.03, 0.02, 0.02, 0.03, 0.02, 0.01, 0.02, 0.02, 0.02, 0.02],
    },
    sessionsByDevice: {mobile: 612, desktop: 301, tablet: 14, other: 0},
  },
  '7d': {
    range: '7d',
    lcp: {value: 2611, unit: 'ms', changePercent: 7.2, rating: 'needs-improvement'},
    inp: {value: 81, unit: 'ms', changePercent: 3.8, rating: 'good'},
    cls: {
      value: 0.05,
      unit: 'score',
      changePercent: 25,
      rating: 'good',
      series: [0.03, 0.04, 0.04, 0.03, 0.05, 0.04, 0.08, 0.05],
    },
    sessionsByDevice: {mobile: 4310, desktop: 2284, tablet: 97, other: 2},
  },
  '30d': {
    range: '30d',
    lcp: {value: 2539, unit: 'ms', changePercent: 7, rating: 'needs-improvement'},
    inp: {value: 48, unit: 'ms', changePercent: 0, rating: 'good'},
    cls: {
      value: 0,
      unit: 'score',
      changePercent: -100,
      rating: 'good',
      series: [
        0.01, 0.01, 0, 0.01, 0.01, 0.02, 0.01, 0.01, 0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.06, 0.02,
        0.01, 0,
      ],
    },
    sessionsByDevice: {mobile: 18420, desktop: 9812, tablet: 431, other: 6},
  },
}

export type WebVitalsState = {
  data: WebVitals
  /** `sample` when the endpoint is unavailable and the sample numbers are shown; `error` without sample data. */
  source: 'live' | 'sample' | 'error'
  loading: boolean
}

/** `endpoint` with `?range=`, resolved against the Studio's origin when relative. */
function endpointUrl(endpoint: string, range: Range) {
  const url = new URL(endpoint, window.location.origin)
  url.searchParams.set('range', range)
  return url.toString()
}

export function useWebVitals(
  range: Range,
  {
    endpoint,
    sampleData = true,
    requestInit,
  }: {endpoint: string; sampleData?: boolean; requestInit?: RequestInit},
): WebVitalsState {
  // The last finished request. Loading is derived: the result is for another request than the
  // current one. Until a new result lands, the previous one stays on screen.
  const key = `${endpoint}|${range}|${sampleData}`
  const [result, setResult] = useState<{
    key: string
    data: WebVitals
    source: WebVitalsState['source']
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(endpointUrl(endpoint, range), {...requestInit, signal: controller.signal})
      .then((res) => (res.ok ? (res.json() as Promise<WebVitals>) : Promise.reject(res.status)))
      .then((data) => setResult({key, data, source: 'live'}))
      .catch(() => {
        if (controller.signal.aborted) return
        setResult({key, data: SAMPLE_WEB_VITALS[range], source: sampleData ? 'sample' : 'error'})
      })

    return () => controller.abort()
  }, [key, endpoint, range, sampleData, requestInit])

  if (!result) {
    return {data: SAMPLE_WEB_VITALS[range], source: sampleData ? 'sample' : 'error', loading: true}
  }
  return {data: result.data, source: result.source, loading: result.key !== key}
}
