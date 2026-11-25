/** The ranges the pane can show and the handler accepts (`?range=`). */
export const RANGES = ['today', '7d', '30d'] as const

export type Range = (typeof RANGES)[number]

export type VitalRating = 'good' | 'needs-improvement' | 'poor'

export type VitalMetric = {
  value: number | null
  unit: 'ms' | 'score'
  /** Change against the previous period of the same length, in percent. */
  changePercent: number | null
  rating: VitalRating | null
  /** One P75 per hour (today) or day (7d, 30d), oldest first; `null` where there was no sample. */
  series?: Array<number | null>
}

export type SessionsByDevice = {
  desktop: number
  mobile: number
  tablet: number
  other: number
}

/** The JSON body the server handler returns and the Studio pane reads. */
export type WebVitals = {
  range: Range
  lcp: VitalMetric
  inp: VitalMetric
  cls: VitalMetric
  sessionsByDevice: SessionsByDevice
}

export function isRange(value: unknown): value is Range {
  return typeof value === 'string' && (RANGES as readonly string[]).includes(value)
}
