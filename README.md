# sanity-plugin-web-vitals

Core Web Vitals (LCP, INP, CLS), sessions by device and a live preview of your site, shown in the Sanity Studio Structure tool's empty pane. The numbers come from a small, framework-agnostic server handler, with Cloudflare Web Analytics built in.

- **Studio plugin** (`sanity-plugin-web-vitals`): renders the pane in the Structure tool's empty pane (landing-pane code adapted from [`sanity-plugin-blank-space`](https://github.com/jordanl17/sanity-plugin-blank-space), MIT).
- **Server handler** (`sanity-plugin-web-vitals/server`): a Web-standard `(Request) => Promise<Response>`. It works as is in Next.js route handlers, SvelteKit endpoints, Workers, Hono and React Router. It reads no env: you pass the Cloudflare credentials in.

## Install

```bash
npm install sanity-plugin-web-vitals
```

## Studio

```ts
import {structureTool} from 'sanity/structure'
import {webVitals} from 'sanity-plugin-web-vitals'

export default defineConfig({
  plugins: [structureTool(), webVitals({title: 'Online Store', previewUrl: '/?studio-preview'})],
})
```

| Option               | Default                       |                                                                                                                        |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `title`              | `'Overview'`                  | Pane header                                                                                                            |
| `paneId`             | `'home'`                      | Pane id in the Studio URL                                                                                              |
| `endpoint`           | `'/api/web-vitals'`           | The route that mounts the handler. Make it absolute when the Studio is on another origin                               |
| `requestInit`        | none                          | Extra `fetch` options for the endpoint, e.g. `credentials` or headers                                                  |
| `defaultRange`       | `'30d'`                       | `today`, `7d` or `30d`                                                                                                 |
| `siteUrl`            | Studio origin                 | The site the card shows. Relative links and `previewUrl` resolve against it                                            |
| `previewUrl`         | `siteUrl`                     | URL of the preview iframe. `false` hides the card                                                                      |
| `card.title`         | the site's host               | Large overlay text: a string or `({ siteUrl, host, lastPublished }) => string`                                         |
| `card.subtitle`      | `'Last published: …'`         | Small overlay text: a string, a function, or `false`                                                                   |
| `primaryAction`      | Edit site → `presentation`    | The card's button. `false` hides it                                                                                    |
| `cardAction`         | `primaryAction`               | What clicking the card or its title does. `false` makes them inert                                                     |
| `menu`               | `DEFAULT_MENU`                | The "…" menu: View site, divider, Reload preview. `false` hides it                                                     |
| `lastPublishedQuery` | newest published `_updatedAt` | GROQ returning the datetime behind `lastPublished`. `false` skips it                                                   |
| `labels`             | generic copy                  | `metrics` (each cell's `label`, `title`, `description`), `ratings`, `ranges`, `devices`, `sampleNotice`, `errorNotice` |
| `sampleData`         | `true`                        | Show labelled sample numbers while the endpoint fails                                                                  |

These are fixed on purpose: the layout, Sanity UI styling, device colours, the preview's 1440×900 render scaled to the card, the card's footer (progressive blur, sticky to the pane's bottom, title icon on card hover), and the Core Web Vitals rating thresholds.

Actions are `{ type: 'tool', title, tool }`, which opens a Studio tool in place (`tool` can include a path, e.g. `structure/page`), or `{ type: 'link', title, href, newTab? }`, which opens a URL in a new tab, relative to `siteUrl`. Menus also take `{ type: 'reload' }` and `{ type: 'divider' }`. Every item takes an optional `icon`.

```ts
import {DEFAULT_MENU, webVitals} from 'sanity-plugin-web-vitals'

webVitals({
  siteUrl: 'https://www.example.com',
  card: {
    title: 'Example Docs',
    subtitle: ({lastPublished}) => lastPublished && `Updated ${lastPublished}`,
  },
  primaryAction: {type: 'tool', title: 'Open Presentation', tool: 'presentation'},
  cardAction: {type: 'link', title: 'Open site', href: '/'},
  labels: {metrics: {sessions: {description: 'Number of docs visits'}}},
  menu: [...DEFAULT_MENU, {type: 'link', title: 'Analytics', href: 'https://dash.cloudflare.com'}],
})
```

## Server

```ts
import {cloudflareWebAnalytics, createWebVitalsHandler} from 'sanity-plugin-web-vitals/server'

const handler = createWebVitalsHandler({
  provider: cloudflareWebAnalytics({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiToken: process.env.CLOUDFLARE_ANALYTICS_API_TOKEN!, // Account Analytics: Read
    host: process.env.CLOUDFLARE_WEB_ANALYTICS_HOST!, // e.g. www.example.com
  }),
  timeZone: 'America/Los_Angeles', // when "today" starts; default UTC
})

// Next.js (app/api/web-vitals/route.ts)
export const GET = handler

// SvelteKit (src/routes/api/web-vitals/+server.ts)
export const GET = ({request}) => handler(request)
```

`GET ?range=today|7d|30d` returns `{ range, lcp, inp, cls, sessionsByDevice }`. Errors return `{ message }` with status 400, 405, 500 (missing credentials) or 502 (Cloudflare refused the request).

To use another analytics source, implement `WebVitalsProvider` (`{ name, getWebVitals({ range, windows, timeZone }) }`). The rating helpers (`metric`, `rateLcp`, `rateInp`, `rateCls`) are exported.

## Agent skill

The package ships a setup skill for coding agents (Claude Code, Codex, Cursor), like Hydrogen's:

```bash
npx sanity-plugin-web-vitals skills sync    # copies skills/ into .claude/skills and .agents/skills
npx sanity-plugin-web-vitals skills check   # exits 1 when the copies are out of date
```

## Status

Version `0.x`: the package publishes TypeScript source (`exports` point at `src/`), which Vite, Next.js and Bun compile. Building it to `dist` is a pre-1.0 TODO.

## License

MIT
