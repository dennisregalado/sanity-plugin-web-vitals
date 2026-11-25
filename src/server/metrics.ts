import type {VitalMetric, VitalRating} from '../types'

/*
 * Shared by providers: Core Web Vitals thresholds (web.dev/articles/vitals) and the change against
 * the previous period.
 */

export function changePercent(current: number | null, previous: number | null) {
  if (current === null || current === undefined) return null
  if (previous === null || previous === undefined || previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function rateLcp(ms: number | null): VitalRating | null {
  if (ms === null || ms === undefined) return null
  if (ms <= 2500) return 'good'
  if (ms <= 4000) return 'needs-improvement'
  return 'poor'
}

export function rateInp(ms: number | null): VitalRating | null {
  if (ms === null || ms === undefined) return null
  if (ms <= 200) return 'good'
  if (ms <= 500) return 'needs-improvement'
  return 'poor'
}

export function rateCls(score: number | null): VitalRating | null {
  if (score === null || score === undefined) return null
  if (score <= 0.1) return 'good'
  if (score <= 0.25) return 'needs-improvement'
  return 'poor'
}

export function metric(
  unit: 'ms' | 'score',
  current: number | null,
  previous: number | null,
  rating: VitalRating | null,
): VitalMetric {
  return {value: current, unit, changePercent: changePercent(current, previous), rating}
}
