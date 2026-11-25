/* global RequestInit -- a DOM type, which ESLint does not know */
import type {ComponentType} from 'react'

import type {Range, SessionsByDevice, VitalRating} from './types'

/** Opens a Studio tool in place, e.g. `{ type: 'tool', title: 'Edit site', tool: 'presentation' }`. */
export type WebVitalsToolAction = {
  type: 'tool'
  title: string
  /** Tool name, optionally with a path inside it: `presentation`, `structure/page`. */
  tool: string
  icon?: ComponentType
}

/** Opens a URL. Relative hrefs resolve against `siteUrl`. Opens in a new tab unless `newTab: false`. */
export type WebVitalsLinkAction = {
  type: 'link'
  title: string
  href: string
  icon?: ComponentType
  newTab?: boolean
}

export type WebVitalsAction = WebVitalsToolAction | WebVitalsLinkAction

export type WebVitalsMenuItem =
  | WebVitalsAction
  /** Reloads the preview iframe. */
  | {type: 'reload'; title?: string; icon?: ComponentType}
  | {type: 'divider'}

export type WebVitalsMetricKey = 'lcp' | 'inp' | 'cls' | 'sessions'

/** A strip cell's label, and the title and copy of the explainer it opens. */
export type WebVitalsMetricCopy = {label?: string; title?: string; description?: string}

/** A range's menu label, button text and comparison line. */
export type WebVitalsRangeCopy = {label?: string; button?: string; comparison?: string}

export type WebVitalsLabels = {
  /** Per-cell copy; unset keys keep the defaults (Core Web Vitals explainers, "Number of site visits"). */
  metrics?: Partial<Record<WebVitalsMetricKey, WebVitalsMetricCopy>>
  /** Badge text. Defaults: Good, Moderate, Poor. */
  ratings?: Partial<Record<VitalRating, string>>
  /** Range menu copy. */
  ranges?: Partial<Record<Range, WebVitalsRangeCopy>>
  /** Device names in the sessions cell. */
  devices?: Partial<Record<keyof SessionsByDevice, string>>
  /** Shown under the strip with sample numbers. */
  sampleNotice?: string
  /** Shown under the strip when loading fails and `sampleData` is off. */
  errorNotice?: string
}

/** What the card's title and subtitle functions receive. */
export type WebVitalsCardContext = {
  /** `siteUrl`, resolved. */
  siteUrl: string
  /** Its host, e.g. `www.example.com`. */
  host: string
  /** Most recent publish across documents, formatted like "Oct 26 at 3:12 PM"; `null` until loaded. */
  lastPublished: string | null
}

export type WebVitalsPluginOptions = {
  /** Pane header title. Defaults to `Overview`. */
  title?: string
  /** Pane id in the Studio URL. Defaults to `home`. */
  paneId?: string
  /**
   * URL of the route that mounts `createWebVitalsHandler()`; `?range=` is appended. Relative URLs
   * resolve against the Studio's origin. Defaults to `/api/web-vitals`.
   */
  endpoint?: string
  /** Range selected when the pane opens. Defaults to `30d`. */
  defaultRange?: Range
  /** The site the card shows and links resolve against. Defaults to the Studio's origin. */
  siteUrl?: string
  /**
   * URL loaded in the live preview card, e.g. `/?studio-preview` with a flag the site reads to skip
   * analytics and popups. Relative URLs resolve against `siteUrl`. Defaults to `siteUrl`; `false`
   * hides the card.
   */
  previewUrl?: string | false
  /** The overlay text on the preview card. */
  card?: {
    /** Large text. Defaults to the site's host. */
    title?: string | ((context: WebVitalsCardContext) => string)
    /** Small text under it. Defaults to "Last published: …"; `false` hides it. */
    subtitle?: string | false | ((context: WebVitalsCardContext) => string | null | false)
  }
  /**
   * The card's button. Defaults to `{ type: 'tool', title: 'Edit site', tool: 'presentation' }`;
   * `false` hides it.
   */
  primaryAction?: WebVitalsAction | false
  /**
   * What clicking the card or its title does. Defaults to `primaryAction`; `false` makes the card
   * and title inert.
   */
  cardAction?: WebVitalsAction | false
  /** The card's "…" menu. Defaults to `DEFAULT_MENU` (View site, Reload preview); `false` hides it. */
  menu?: WebVitalsMenuItem[] | false
  /** Every piece of copy in the pane; unset keys keep the defaults. */
  labels?: WebVitalsLabels
  /**
   * GROQ returning one datetime for `lastPublished` (the default subtitle). Defaults to the newest
   * `_updatedAt` across published, non-system documents. `false` skips the query.
   */
  lastPublishedQuery?: string | false
  /** Extra `fetch` options for the endpoint request, e.g. `credentials` or headers. */
  requestInit?: RequestInit
  /** Show sample numbers (labelled as such) while the endpoint fails. Defaults to `true`. */
  sampleData?: boolean
}

export type ResolvedWebVitalsOptions = {
  title: string
  paneId: string
  endpoint: string
  defaultRange: Range
  siteUrl?: string
  previewUrl?: string | false
  card: NonNullable<WebVitalsPluginOptions['card']>
  primaryAction: WebVitalsAction | false
  cardAction: WebVitalsAction | false
  menu: WebVitalsMenuItem[] | false
  labels: WebVitalsLabels & Required<Pick<WebVitalsLabels, 'sampleNotice' | 'errorNotice'>>
  lastPublishedQuery: string | false
  requestInit?: RequestInit
  sampleData: boolean
}

export const DEFAULT_TITLE = 'Overview'
export const DEFAULT_ENDPOINT = '/api/web-vitals'

export const DEFAULT_PRIMARY_ACTION: WebVitalsAction = {
  type: 'tool',
  title: 'Edit site',
  tool: 'presentation',
}

/** The default "…" menu. Spread it to add items: `menu: [...DEFAULT_MENU, { type: 'link', … }]`. */
export const DEFAULT_MENU: WebVitalsMenuItem[] = [
  {type: 'link', title: 'View site', href: '/'},
  {type: 'divider'},
  {type: 'reload', title: 'Reload preview'},
]

export const DEFAULT_LAST_PUBLISHED_QUERY = `*[!(_id in path("drafts.**")) && !(_id in path("versions.**")) && !(_type match "sanity.*") && !(_id in path("_.**"))] | order(_updatedAt desc)[0]._updatedAt`

export const DEFAULT_LABELS: ResolvedWebVitalsOptions['labels'] = {
  sampleNotice: 'Sample data. Web Vitals are not connected yet.',
  errorNotice: 'Web Vitals could not be loaded.',
}

export function resolveOptions(options: WebVitalsPluginOptions = {}): ResolvedWebVitalsOptions {
  const primaryAction = options.primaryAction ?? DEFAULT_PRIMARY_ACTION
  return {
    title: options.title ?? DEFAULT_TITLE,
    paneId: options.paneId ?? 'home',
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    defaultRange: options.defaultRange ?? '30d',
    siteUrl: options.siteUrl,
    previewUrl: options.previewUrl,
    card: options.card ?? {},
    primaryAction,
    cardAction: options.cardAction ?? primaryAction,
    menu: options.menu ?? DEFAULT_MENU,
    labels: {...DEFAULT_LABELS, ...options.labels},
    lastPublishedQuery: options.lastPublishedQuery ?? DEFAULT_LAST_PUBLISHED_QUERY,
    requestInit: options.requestInit,
    sampleData: options.sampleData ?? true,
  }
}
