import CalendarIcon from '@sanity/icons/Calendar'
import CheckmarkIcon from '@sanity/icons/Checkmark'
import ChevronLeftIcon from '@sanity/icons/ChevronLeft'
import ChevronRightIcon from '@sanity/icons/ChevronRight'
import EditIcon from '@sanity/icons/Edit'
import EllipsisHorizontalIcon from '@sanity/icons/EllipsisHorizontal'
import LaunchIcon from '@sanity/icons/Launch'
import RefreshIcon from '@sanity/icons/Refresh'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Skeleton,
  Stack,
  Text,
  TextSkeleton,
  useRootTheme,
} from '@sanity/ui'
import {Menu, MenuButton, MenuDivider, MenuItem} from '@sanity/ui/menu'
import {Popover} from '@sanity/ui/popover'
import {
  type ComponentType,
  createContext,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {useClient, useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

import {
  DEFAULT_LABELS,
  type ResolvedWebVitalsOptions,
  type WebVitalsAction,
  type WebVitalsCardContext,
} from './options'
import type {Range, VitalMetric, VitalRating, WebVitals} from './types'
import {RANGE_OPTIONS, useWebVitals} from './useWebVitals'

/*
 * Structure tool landing pane, modelled on Shopify's Online Store
 * overview: a Web Vitals strip over a live preview of the site's home page.
 */

/** The preview renders the home page at this desktop size, then scales it to the card. */
const PREVIEW = {width: 1440, height: 900}
const API_VERSION = '2025-05-16'

const ratingBadge: Record<VitalRating, {tone: 'positive' | 'caution' | 'critical'; text: string}> =
  {
    good: {tone: 'positive', text: 'Good'},
    'needs-improvement': {tone: 'caution', text: 'Moderate'},
    poor: {tone: 'critical', text: 'Poor'},
  }

/** Each cell's label, and the title and copy of the explainer shown when it is clicked. */
const metricInfo = {
  lcp: {
    label: 'LCP P75',
    title: 'TL;DR - How Fast The Page Loads',
    description:
      'The Largest Contentful Paint (LCP) score measures loading speed, based on how fast the largest element or main content becomes visible to visitors. A good LCP score is achieved when the main content is loaded within 2,500 milliseconds from the start of the page load for the 75th percentile of users.',
  },
  inp: {
    label: 'INP P75',
    title: 'TL;DR - How Snappy Your Site Feels',
    description:
      'The Interaction to Next Paint (INP) score measures interactivity based on how long it takes the page to become responsive to most user actions, such as clicking a link or a button. An INP score of less than 200 milliseconds for the 75th percentile of users is considered a good performance as the page becomes interactive quickly.',
  },
  cls: {
    label: 'Cumulative Layout Shift',
    title: 'TL;DR - How Much Content Shifts Around',
    description:
      'The Cumulative Layout Shift (CLS) score measures visual stability, based on how much the content shifts around unexpectedly when navigating around the page. A CLS score of less than 0.1 for the 75th percentile of users is considered good.',
  },
  sessions: {
    label: 'Sessions by device type',
    title: 'Sessions by Device Type',
    description: 'Number of site visits',
  },
} as const

type MetricKey = keyof typeof metricInfo

/** The plugin's copy options, read by the strip's cells. */
const LabelsContext = createContext(DEFAULT_LABELS)

/** Height of a value row that holds a Badge, so rows without one line up with it. */
const VALUE_ROW_HEIGHT = 17

const devices = [
  {key: 'mobile', label: 'Mobile', color: '#2276fc'},
  {key: 'desktop', label: 'Desktop', color: '#8f57ef'},
  {key: 'tablet', label: 'Tablet', color: '#2bb38f'},
  {key: 'other', label: 'Other', color: '#8690a0'},
] as const

export function WebVitalsPane({options}: {options: ResolvedWebVitalsOptions}) {
  const [range, setRange] = useState<Range>(options.defaultRange)
  const vitals = useWebVitals(range, options)

  return (
    <LabelsContext.Provider value={options.labels}>
      {/* No bottom padding on the scroller: a sticky element stops at its scroller's padding edge, which
			    would float the card's sticky footer above the pane's bottom. The spacer below pads instead. */}
      <Box paddingX={[3, 4, 5]} paddingTop={[3, 4, 5]} style={{height: '100%', overflow: 'auto'}}>
        <Stack gap={4} style={{maxWidth: 1000, margin: '0 auto'}}>
          <Stack gap={2}>
            <MetricsStrip
              range={range}
              onRangeChange={setRange}
              data={vitals.data}
              loading={vitals.loading}
            />
            {vitals.source === 'sample' && !vitals.loading && (
              <Text size={1} muted>
                {options.labels.sampleNotice}
              </Text>
            )}
            {vitals.source === 'error' && !vitals.loading && (
              <Text size={1} muted>
                {options.labels.errorNotice}
              </Text>
            )}
          </Stack>
          {options.previewUrl !== false && <SiteCard options={options} />}
        </Stack>
        <Box paddingBottom={[3, 4, 5]} />
      </Box>
    </LabelsContext.Provider>
  )
}

/*
 * Edge fades for the metrics scroller, after shadcn's scroll-fade utility
 * (ui.shadcn.com/docs/utils/scroll-fade), without the package: a mask on the scroll container
 * whose edges fade in over the first 96px of scroll in each direction, driven by a scroll timeline.
 * With nothing to scroll the timeline is inactive and the mask stays solid. Browsers without scroll
 * timelines (Firefox) use the edges the strip already measures instead.
 *
 * The arrows overlay the right edge and only show while the strip is hovered or has keyboard focus
 * (`:focus-visible`, so a clicked arrow does not keep them on screen after the pointer leaves).
 * While they show, the mask also clears the pill's width, so content fades out ahead of the arrows
 * instead of running under them. A trailing spacer of the same width ends the track there, so at the
 * last position every value sits fully left of the arrows.
 */
/** Edge fade depth: wider than shadcn's 40px default. */
const METRICS_FADE = '120px'
/** Arrow pill (66px) plus its 12px inset and 10px of air; also the track's trailing spacer. */
const METRICS_ARROWS_CLEAR = 88

const METRICS_STRIP_CSS = `
@property --metrics-fade-start { syntax: '<length>'; inherits: false; initial-value: 0px; }
@property --metrics-fade-end { syntax: '<length>'; inherits: false; initial-value: 0px; }
@property --metrics-clear { syntax: '<length>'; inherits: false; initial-value: 0px; }
@keyframes metrics-fade-start { from { --metrics-fade-start: 0px; } to { --metrics-fade-start: ${METRICS_FADE}; } }
@keyframes metrics-fade-end { from { --metrics-fade-end: ${METRICS_FADE}; } to { --metrics-fade-end: 0px; } }
[data-metrics-scroller] {
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 var(--metrics-fade-start),
    #000 calc(100% - var(--metrics-clear) - var(--metrics-fade-end)),
    transparent calc(100% - var(--metrics-clear))
  );
}
[data-metrics-strip]:hover:has([data-metrics-arrows]) [data-metrics-scroller],
[data-metrics-strip]:has(:focus-visible):has([data-metrics-arrows]) [data-metrics-scroller] {
  --metrics-clear: ${METRICS_ARROWS_CLEAR}px;
}
@supports (animation-timeline: scroll()) {
  [data-metrics-scroller] {
    animation: metrics-fade-start linear both, metrics-fade-end linear both;
    animation-timeline: scroll(self inline);
    animation-range: 0px 96px, calc(100% - 96px) 100%;
  }
}
@supports not (animation-timeline: scroll()) {
  [data-metrics-scroller][data-fade-start='true'] { --metrics-fade-start: ${METRICS_FADE}; }
  [data-metrics-scroller][data-fade-end='true'] { --metrics-fade-end: ${METRICS_FADE}; }
}
[data-metrics-arrows] { opacity: 0; pointer-events: none; }
[data-metrics-strip]:hover [data-metrics-arrows],
[data-metrics-strip]:has(:focus-visible) [data-metrics-arrows] { opacity: 1; pointer-events: auto; }
`

function MetricsStrip({
  range,
  onRangeChange,
  data,
  loading,
}: {
  range: Range
  onRangeChange: (next: Range) => void
  data: WebVitals
  loading: boolean
}) {
  const labels = useContext(LabelsContext)
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({overflow: false, start: true, end: true})

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({
      overflow: el.scrollWidth > el.clientWidth + 1,
      start: el.scrollLeft <= 0,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }, [])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])
  // The strip keeps its size when values swap (skeletons, empty range, data), so re-check overflow.
  useLayoutEffect(measure, [measure, data, loading])

  // One explainer popover open at a time; outside clicks and Escape close it.
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null)
  useEffect(() => {
    if (!openMetric) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-metric-popover]')) setOpenMetric(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMetric(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMetric])
  const cellProps = (key: MetricKey) => ({
    metricKey: key,
    open: openMetric === key,
    onToggle: () => setOpenMetric((current) => (current === key ? null : key)),
  })

  const scrollBy = (direction: 1 | -1) =>
    scroller.current?.scrollBy({left: direction * 320, behavior: 'smooth'})

  return (
    <Card radius={3} border data-metrics-strip="">
      <style>{METRICS_STRIP_CSS}</style>
      <Flex align="stretch">
        <Flex align="stretch" padding={1} style={{flex: 'none'}}>
          <RangeMenu range={range} onChange={onRangeChange} />
        </Flex>
        <Box style={{position: 'relative', flex: 1, minWidth: 0, display: 'flex'}}>
          <Flex
            ref={scroller}
            onScroll={measure}
            align="stretch"
            data-metrics-scroller=""
            data-fade-start={edges.overflow && !edges.start}
            data-fade-end={edges.overflow && !edges.end}
            style={{flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none'}}
          >
            <MetricCell {...cellProps('lcp')} metric={data.lcp} loading={loading} />
            <MetricCell {...cellProps('inp')} metric={data.inp} loading={loading} />
            <MetricCell {...cellProps('cls')} metric={data.cls} loading={loading} />
            <Cell {...cellProps('sessions')}>
              {loading ? (
                <ValueSkeleton width={260} />
              ) : (
                <Flex gap={4} align="center" style={{minHeight: VALUE_ROW_HEIGHT}}>
                  {devices.map((device) => (
                    <Flex key={device.key} gap={2} align="baseline" style={{whiteSpace: 'nowrap'}}>
                      <Text
                        size={1}
                        weight="semibold"
                        style={{
                          textDecoration: 'underline',
                          textDecorationColor: device.color,
                          textDecorationThickness: 2,
                          textUnderlineOffset: 5,
                        }}
                      >
                        {data.sessionsByDevice[device.key].toLocaleString()}
                      </Text>
                      <Text size={1}>{labels.devices?.[device.key] ?? device.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              )}
            </Cell>
            {/* Ends the track at the arrows, so the last position leaves the values clear of them. */}
            {edges.overflow && (
              <div aria-hidden style={{flex: 'none', width: METRICS_ARROWS_CLEAR}} />
            )}
          </Flex>
          {edges.overflow && (
            <Card
              data-metrics-arrows=""
              radius={2}
              tone="transparent"
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <Flex>
                <Button
                  icon={ChevronLeftIcon}
                  mode="bleed"
                  padding={3}
                  disabled={edges.start}
                  onClick={() => scrollBy(-1)}
                  aria-label="Previous metrics"
                />
                <Button
                  icon={ChevronRightIcon}
                  mode="bleed"
                  padding={3}
                  disabled={edges.end}
                  onClick={() => scrollBy(1)}
                  aria-label="Next metrics"
                />
              </Flex>
            </Card>
          )}
        </Box>
      </Flex>
    </Card>
  )
}

function RangeMenu({range, onChange}: {range: Range; onChange: (next: Range) => void}) {
  const labels = useContext(LabelsContext)
  const options = RANGE_OPTIONS.map((option) => ({...option, ...labels.ranges?.[option.value]}))
  const current = options.find((option) => option.value === range) ?? options[2]
  const [open, setOpen] = useState(false)

  return (
    <MenuButton
      id="web-vitals-range"
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      // Same interactive Card as the metric cells: native hover, pressed while the menu is open.
      // `selected={false}` stops MenuButton from applying the selected tone instead.
      button={
        <Card
          as="button"
          type="button"
          radius={2}
          paddingX={3}
          selected={false}
          pressed={open}
          __unstable_focusRing
          style={{display: 'flex', alignItems: 'center'}}
        >
          <Flex gap={2} align="center">
            <Text size={1}>
              <CalendarIcon />
            </Text>
            <Text size={1}>{current.button}</Text>
          </Flex>
        </Card>
      }
      popover={{placement: 'bottom-start', portal: true}}
      menu={
        <Menu>
          {options.map((option) => (
            <MenuItem key={option.value} onClick={() => onChange(option.value)}>
              {/* Like Studio's appearance menu: a trailing checkmark marks the current choice. */}
              <Flex gap={4} align="flex-start">
                <Stack gap={2} flex={1}>
                  <Text size={1} weight="medium">
                    {option.label}
                  </Text>
                  <Text size={1} muted>
                    {option.comparison}
                  </Text>
                </Stack>
                <Text size={1} style={{visibility: option.value === range ? 'visible' : 'hidden'}}>
                  <CheckmarkIcon />
                </Text>
              </Flex>
            </MenuItem>
          ))}
        </Menu>
      }
    />
  )
}

type CellProps = {metricKey: MetricKey; open: boolean; onToggle: () => void}

/**
 * One strip cell: a divider-separated slot holding an interactive Card (Sanity UI's native hover,
 * pressed and focus states, as in Studio list rows) that opens an explainer popover.
 */
function Cell({metricKey, open, onToggle, children}: CellProps & {children: ReactNode}) {
  const labels = useContext(LabelsContext)
  const info = {...metricInfo[metricKey], ...labels.metrics?.[metricKey]}

  return (
    // Cells grow to share spare width, so a strip of short values (empty ranges, "—") spans the
    // card like a full one instead of bunching up on the left. Wide content still scrolls.
    <Card borderLeft padding={1} style={{flex: '1 0 auto', display: 'flex'}}>
      <Popover
        open={open}
        portal
        placement="bottom-start"
        fallbackPlacements={['bottom-end', 'top-start']}
        // Same shell as Studio's global presence menu ("No one else is here"): a 260px menu with
        // 4px inner padding around a 12px-padded block of size-1 text.
        content={
          <Box padding={1} data-metric-popover="" style={{maxWidth: 260}}>
            <Box padding={3}>
              <Stack gap={3}>
                <Text size={1} weight="medium">
                  {info.title}
                </Text>
                <Text size={1} muted>
                  {info.description}
                </Text>
              </Stack>
            </Box>
          </Box>
        }
      >
        <Card
          as="button"
          type="button"
          data-metric-popover=""
          radius={2}
          paddingX={3}
          paddingY={2}
          pressed={open}
          __unstable_focusRing
          onClick={onToggle}
          aria-expanded={open}
          // A button centres its content vertically; top-align so every cell's label lines up.
          style={{
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            flex: 1,
          }}
        >
          <Stack gap={3}>
            <Text size={1} weight="medium">
              <span style={{textDecoration: 'underline dotted', textUnderlineOffset: 4}}>
                {info.label}
              </span>
            </Text>
            {children}
          </Stack>
        </Card>
      </Popover>
    </Card>
  )
}

/** Stand-in for a cell's value row while `/api/web-vitals` is loading. */
function ValueSkeleton({width}: {width: number}) {
  return (
    <Flex align="center" style={{minHeight: VALUE_ROW_HEIGHT}}>
      <TextSkeleton animated size={1} radius={1} style={{width}} />
    </Flex>
  )
}

function MetricCell({
  metric,
  loading,
  ...cell
}: CellProps & {metric: VitalMetric; loading: boolean}) {
  const labels = useContext(LabelsContext)
  const badge = metric.rating
    ? {
        ...ratingBadge[metric.rating],
        text: labels.ratings?.[metric.rating] ?? ratingBadge[metric.rating].text,
      }
    : null
  // A sparkline when there is a series with data, else the rating badge.
  let trend: ReactNode = null
  if (metric.series?.some((value) => value !== null)) trend = <Sparkline values={metric.series} />
  else if (badge) trend = <Badge tone={badge.tone}>{badge.text}</Badge>

  if (loading) {
    return (
      <Cell {...cell}>
        <ValueSkeleton width={metric.unit === 'ms' ? 200 : 120} />
      </Cell>
    )
  }

  return (
    <Cell {...cell}>
      <Flex gap={3} align="center" style={{whiteSpace: 'nowrap'}}>
        <Text size={1} weight="semibold" muted={metric.value === null}>
          {formatValue(metric)}
        </Text>
        <Change percent={metric.changePercent} />
        {trend}
      </Flex>
    </Cell>
  )
}

function formatValue(metric: VitalMetric) {
  if (metric.value === null) return '—'
  return metric.unit === 'ms' ? `${metric.value} milliseconds` : String(metric.value)
}

function Change({percent}: {percent: number | null}) {
  if (percent === null) return null
  const rounded = Math.round(Math.abs(percent))
  return (
    <Text size={1} muted>
      {rounded === 0 ? '—' : `${percent > 0 ? '↗' : '↘'} ${rounded}%`}
    </Text>
  )
}

/**
 * One flat step per bucket at that bucket's P75, like Shopify's chart. Gaps (`null`) break the
 * line instead of dropping to 0, which would read as a perfect score. The scale tops out at the
 * highest value or 0.1 (the Good threshold), so a run of zeros sits on the baseline.
 */
function Sparkline({values}: {values: Array<number | null>}) {
  const width = 96
  const height = VALUE_ROW_HEIGHT
  const step = width / values.length
  const max = Math.max(0.1, ...values.map((value) => value ?? 0))
  const y = (value: number) => (height - 1 - (value / max) * (height - 2)).toFixed(1)

  let path = ''
  values.forEach((value, index) => {
    if (value === null) return
    const x = (index * step).toFixed(1)
    const nextX = ((index + 1) * step).toFixed(1)
    path += `${index === 0 || values[index - 1] === null ? 'M' : 'L'}${x},${y(value)}H${nextX}`
  })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path
        d={path}
        fill="none"
        stroke="#2276fc"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SiteCard({options}: {options: ResolvedWebVitalsOptions}) {
  const {basePath} = useWorkspace()
  const router = useRouter()
  const lastPublished = useLastPublished(options.lastPublishedQuery)
  const [reloads, setReloads] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [titleHovered, setTitleHovered] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)
  // The footer is a dark Card; its menu should use the Studio's scheme, as Studio's own menus do.
  const {scheme} = useRootTheme()

  const siteUrl = new URL(options.siteUrl ?? window.location.origin)
  const origin = siteUrl.toString()
  // Relative preview URLs (e.g. `/?preview-flag`) resolve against the site.
  const previewUrl = options.previewUrl ? new URL(options.previewUrl, origin).toString() : origin

  const context: WebVitalsCardContext = {siteUrl: origin, host: siteUrl.host, lastPublished}
  const {title, subtitle} = options.card
  const cardTitle = typeof title === 'function' ? title(context) : (title ?? context.host)
  let cardSubtitle: string | null = null
  if (typeof subtitle === 'function') cardSubtitle = subtitle(context) || null
  else if (subtitle !== false) {
    cardSubtitle = subtitle ?? (lastPublished ? `Last published: ${lastPublished}` : null)
  }

  const primary = options.primaryAction || null
  const cardAction = options.cardAction || null
  const menu = options.menu || []

  const reload = () => {
    setLoaded(false)
    setReloads((count) => count + 1)
  }

  /**
   * Anchor props for an action. Tools navigate in place for a plain click (modified clicks keep the
   * link's new-tab behaviour); links open in a new tab unless `newTab: false`.
   */
  const linkProps = (action: WebVitalsAction) => {
    if (action.type === 'link') {
      const newTab = action.newTab ?? true
      return {
        href: new URL(action.href, origin).toString(),
        target: newTab ? '_blank' : undefined,
        rel: newTab ? 'noreferrer' : undefined,
      }
    }
    const path = `${basePath}/${action.tool.replace(/^\/+/, '')}`
    return {
      href: path,
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        event.preventDefault()
        router.navigateUrl({path})
      },
    }
  }

  // The card and its title run `cardAction` (by default the primary action). The hover icon is the
  // action's own, else a pencil for a tool and a launch arrow for a link.
  const TitleIcon = (cardAction?.icon ??
    (cardAction?.type === 'link' ? LaunchIcon : EditIcon)) as ComponentType<{
    style?: CSSProperties
  }>

  return (
    <Card
      radius={3}
      shadow={1}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
      style={{
        position: 'relative',
        aspectRatio: `${PREVIEW.width} / ${PREVIEW.height}`,
        // `clip`, not `hidden`: a hidden overflow is a scroll container, which would pin the sticky
        // footer to the card instead of the pane.
        overflow: 'clip',
        // The footer sits in flow at the bottom, so it can stick.
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <LivePreview key={reloads} src={previewUrl} onLoad={() => setLoaded(true)} />

      {!loaded && (
        <Skeleton
          animated
          aria-label="Loading the home page"
          style={{position: 'absolute', inset: 0}}
        />
      )}

      {/* The whole card runs `cardAction`. Out of the tab order: the card's buttons are the keyboard
			    route. */}
      {cardAction && (
        <a
          {...linkProps(cardAction)}
          tabIndex={-1}
          aria-hidden
          style={{position: 'absolute', inset: 0}}
        />
      )}

      <Card
        scheme="dark"
        tone="transparent"
        paddingTop={7}
        style={{
          // 24px sits between Sanity's 20px and 32px space steps.
          paddingInline: 24,
          paddingBottom: 24,
          // Stays at the bottom of the pane while the card runs past it, so the title and buttons
          // never need a scroll to reach.
          position: 'sticky',
          bottom: 0,
          // Clicks on the gradient and title fall through to the card link below.
          pointerEvents: 'none',
          // The dark Card paints its own background; the blur and gradient layers replace it.
          background: 'transparent',
        }}
      >
        <ProgressiveBlur />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.45) 35%, rgb(0 0 0 / 0.75))',
          }}
        />
        {/* Positioned so it paints above the absolute blur and gradient layers. */}
        <Flex
          align="flex-end"
          justify="space-between"
          gap={4}
          wrap="wrap"
          style={{position: 'relative'}}
        >
          <Stack gap={3}>
            {/* Like Shopify's theme name: hovering the card shows the icon, and hovering the title
						    also dims it slightly. Made hoverable through the footer's pointer-events: none. */}
            {cardAction ? (
              <a
                {...linkProps(cardAction)}
                onMouseEnter={() => setTitleHovered(true)}
                onMouseLeave={() => setTitleHovered(false)}
                tabIndex={-1}
                aria-hidden
                style={{
                  pointerEvents: 'auto',
                  justifySelf: 'start',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Flex gap={2} align="center">
                  <Text
                    size={4}
                    weight="medium"
                    style={{opacity: titleHovered ? 0.8 : 1, transition: 'opacity 150ms'}}
                  >
                    {cardTitle}
                  </Text>
                  {/* Full white, not dimmed with the title. Set on the icon: Text recolors icons
								    inside it to its muted icon colour. */}
                  <Text size={3} style={{visibility: cardHovered ? 'visible' : 'hidden'}}>
                    <TitleIcon style={{color: '#fff'}} />
                  </Text>
                </Flex>
              </a>
            ) : (
              <Text size={4} weight="medium">
                {cardTitle}
              </Text>
            )}
            {cardSubtitle && <Text size={1}>{cardSubtitle}</Text>}
          </Stack>
          <Flex gap={2} align="center" style={{pointerEvents: 'auto'}}>
            {/* A bleed button inside the dark footer Card fills with that Card's background colour. Clear it
						    while idle only, so Sanity's hover and open states still apply. */}
            <style>{`#web-vitals-actions:not(:hover):not([aria-expanded='true']) { background-color: transparent; }`}</style>
            {primary && (
              <Button
                as="a"
                {...linkProps(primary)}
                icon={primary.icon}
                text={primary.title}
                mode="default"
                tone="default"
              />
            )}
            {menu.length > 0 && (
              <MenuButton
                id="web-vitals-actions"
                button={
                  <Button icon={EllipsisHorizontalIcon} mode="bleed" aria-label="More actions" />
                }
                popover={{placement: 'top-end', portal: true, scheme}}
                menu={
                  <Menu>
                    {menu.map((item, index) => {
                      if (item.type === 'divider') return <MenuDivider key={index} />
                      if (item.type === 'reload') {
                        return (
                          <MenuItem
                            key={index}
                            icon={item.icon ?? RefreshIcon}
                            text={item.title ?? 'Reload preview'}
                            onClick={reload}
                          />
                        )
                      }
                      return (
                        <MenuItem
                          key={index}
                          as="a"
                          {...linkProps(item)}
                          icon={item.icon ?? (item.type === 'link' ? LaunchIcon : undefined)}
                          text={item.title}
                        />
                      )
                    })}
                  </Menu>
                }
              />
            )}
          </Flex>
        </Flex>
      </Card>
    </Card>
  )
}

/**
 * A blur that strengthens toward the bottom, behind the card's title and buttons, so the site's own
 * text does not show through them. Eight stacked layers, each blurring twice as much as the one above
 * and masked to its own band, read as one smooth ramp.
 */
const BLUR_LAYERS = Array.from({length: 8}, (_, i) => {
  const stop = (n: number) => `${12.5 * (i + n)}%`
  const mask = `linear-gradient(to bottom, rgb(0 0 0 / 0) ${stop(0)}, rgb(0 0 0) ${stop(1)}, rgb(0 0 0) ${stop(2)}, rgb(0 0 0 / 0) ${stop(3)})`
  const blur = `blur(${0.28125 * 2 ** i}px)`
  return {
    position: 'absolute',
    inset: 0,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    maskImage: mask,
    WebkitMaskImage: mask,
  } satisfies CSSProperties
})

function ProgressiveBlur() {
  return (
    <div aria-hidden style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      {BLUR_LAYERS.map((style, index) => (
        <div key={index} style={style} />
      ))}
    </div>
  )
}

/**
 * The live home page at desktop width, scaled to fit and non-interactive. Pass a `previewUrl` with a
 * flag the site reads to skip analytics and popups, so editors opening the Studio are not counted.
 */
function LivePreview({src, onLoad}: {src: string; onLoad: () => void}) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / PREVIEW.width),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frame} style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <iframe
        src={src}
        title="Site home page preview"
        tabIndex={-1}
        aria-hidden
        onLoad={onLoad}
        style={{
          width: PREVIEW.width,
          height: PREVIEW.height,
          maxWidth: 'none',
          border: 0,
          pointerEvents: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          visibility: scale ? 'visible' : 'hidden',
        }}
      />
    </div>
  )
}

/** The datetime `query` returns, formatted like "Oct 26 at 3:12 PM"; `false` skips it. */
function useLastPublished(query: string | false) {
  const client = useClient({apiVersion: API_VERSION})
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!query) return undefined
    let active = true
    client
      .fetch<string | null>(query, {}, {perspective: 'published'})
      .then((updatedAt) => {
        if (!active || !updatedAt) return
        const date = new Date(updatedAt)
        const day = date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
        const time = date.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})
        setLabel(`${day} at ${time}`)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [client, query])

  return label
}
