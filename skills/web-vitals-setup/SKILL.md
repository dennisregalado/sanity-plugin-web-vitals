---
name: web-vitals-setup
description: >
  Set up sanity-plugin-web-vitals: the Structure tool landing pane with Core Web Vitals (LCP, INP,
  CLS), sessions by device and a live site preview, plus the framework-agnostic server route that
  feeds it from Cloudflare Web Analytics. Use when adding Web Vitals or a site overview to a Sanity
  Studio, mounting `createWebVitalsHandler` in SvelteKit, Next.js, Workers, Hono or React Router,
  wiring Cloudflare Web Analytics credentials, or debugging a pane that shows sample data.
metadata:
  source: 'sanity-plugin-web-vitals'
---

# Web Vitals setup

`sanity-plugin-web-vitals` has two halves that meet at one URL:

| Half           | Import                            | Runs in          | Job                                                                 |
| -------------- | --------------------------------- | ---------------- | ------------------------------------------------------------------- |
| Studio plugin  | `sanity-plugin-web-vitals`        | Browser (Studio) | Renders the pane; fetches `GET <endpoint>?range=today\|7d\|30d`     |
| Server handler | `sanity-plugin-web-vitals/server` | Server or edge   | `(Request) => Promise<Response>`; queries the provider (Cloudflare) |

The handler is Web-standard and reads no environment variables. The app reads its own env and passes the credentials in, so the same code runs in any framework.

## 1. Inventory before writing anything

Answer these from the code and write the answers down:

- **Framework and router.** Which server framework serves the site (SvelteKit, Next.js App Router or Pages Router, Workers/Hono, React Router)? Where do API routes live?
- **Where the Studio is hosted.**
  - _Embedded_: the Studio is a route of the site (e.g. `/studio`). Then the default `endpoint: '/api/web-vitals'` and `siteUrl` (the Studio's origin) are right.
  - _Hosted separately_ (`*.sanity.studio`, or another origin). Then `endpoint` and `siteUrl` must be absolute, and the route must answer CORS for the Studio origin (step 4).
- **Env handling.** How the app reads server secrets (`$env/static/private`, `$app/env/private`, `process.env`, the Workers `env` binding). Never import secrets into browser code.
- **Store/site time zone.** "Today" starts at local midnight in this zone. Use the business's zone (e.g. `America/Los_Angeles`), not the server's. Defaults to `UTC`.
- **What the site is.** A store, a docs site, a marketing site? Use the matching words for the card and the menu ("View store", "Number of store visits") instead of the generic defaults.
- **Edit tool.** The name of the Studio tool the card's button opens: `presentation` for `sanity/presentation`, or the custom tool's `name` (read `sanity.config` for `tools` and plugins that add one). Use `primaryAction: false` if there is none.
- **Card click.** Should clicking the preview open the same tool, the live site, or nothing? (`cardAction`, which defaults to the button.)
- **Card text.** What the overlay should say. The default is the host (e.g. `localhost:5173` in dev), so set `card.title` when the site has a name. Decide whether "Last published" means the newest document overall (the default), a narrower query, or nothing.
- **Existing landing pane.** Does the Studio already fill the Structure tool's empty pane (e.g. `sanity-plugin-blank-space`'s `structureHomeLandingPlugin(...)`)? This plugin takes over that pane, so remove the other one. Two plugins would fight over the same pane.
- **Beacon.** Does the site load the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js`)? It produces the data (step 2).

## 2. Cloudflare Web Analytics

The built-in provider reads Cloudflare's RUM datasets (`rumWebVitalsEventsAdaptiveGroups`, `rumPageloadEventsAdaptiveGroups`) through the GraphQL Analytics API.

1. **Enable Web Analytics** for the site in the Cloudflare dashboard (Analytics & Logs › Web Analytics). For a proxied zone it can inject the beacon automatically. Otherwise add the JS snippet yourself, with the site token as a _public_ env var.
2. **Skip the beacon inside frames.** The pane's live preview and Sanity's Presentation tool embed the site, and editors are not visitors. Guard the snippet with `window.self !== window.top`. Also skip it when the preview flag from step 3 is present.
3. **Create an API token** with _Account › Account Analytics › Read_ (My Profile › API Tokens). This is a server secret.
4. **Record three server env vars** (names are up to the app; these are conventional):

   | Env var                          | Value                                                                  |
   | -------------------------------- | ---------------------------------------------------------------------- |
   | `CLOUDFLARE_ACCOUNT_ID`          | The account that owns the Web Analytics site                           |
   | `CLOUDFLARE_ANALYTICS_API_TOKEN` | Token from step 3                                                      |
   | `CLOUDFLARE_WEB_ANALYTICS_HOST`  | The hostname Web Analytics records, e.g. `www.example.com` (no scheme) |

   On Cloudflare Workers, set the token with `wrangler secret put` and the other two as `vars`.

Missing credentials are not fatal: the handler answers 500 and the pane shows labelled sample numbers (`sampleData: true`, the default).

## 3. Studio plugin

```bash
npm install sanity-plugin-web-vitals
```

Peers: `sanity` 5 or 6, `react` 18 or 19, `@sanity/ui` 4, `@sanity/icons` 5.

Register it after `structureTool()`:

```ts
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { DEFAULT_MENU, webVitals } from 'sanity-plugin-web-vitals';

export default defineConfig({
	// ...
	plugins: [
		structureTool(),
		webVitals({
			title: 'Online Store', // pane header; default 'Overview'
			endpoint: '/api/web-vitals', // default; absolute when the Studio is hosted elsewhere
			// requestInit: { credentials: 'include' }, // extra fetch options for the endpoint
			previewUrl: '/?studio-preview', // relative to siteUrl; false hides the preview card
			// siteUrl: 'https://www.example.com', // default: the Studio's origin
			card: {
				title: 'Example Store', // default: the site's host; or ({ siteUrl, host, lastPublished }) => string
				subtitle: ({ lastPublished }) => lastPublished && `Last published: ${lastPublished}` // false hides it
			},
			// The card's button. false hides it.
			primaryAction: { type: 'tool', title: 'Edit site', tool: 'presentation' },
			// Clicking the card or its title. Default: primaryAction. false makes them inert.
			cardAction: { type: 'link', title: 'Open store', href: '/' },
			// The "…" menu. Default: DEFAULT_MENU (View site, divider, Reload preview). false hides it.
			menu: [
				{ type: 'link', title: 'View store', href: '/' }, // relative to siteUrl; new tab unless newTab: false
				{ type: 'divider' },
				{ type: 'reload', title: 'Reload preview' }
			],
			// GROQ for the datetime behind lastPublished; false skips it.
			// lastPublishedQuery: `*[_type == "post"] | order(_updatedAt desc)[0]._updatedAt`,
			labels: {
				metrics: { sessions: { description: 'Number of store visits' } } // lcp | inp | cls | sessions: label, title, description
				// ratings: { 'needs-improvement': 'Fair' },
				// ranges: { '7d': { label: 'Past week' } },
				// devices: { other: 'TV & other' },
				// sampleNotice, errorNotice
			}
			// defaultRange: '30d',
			// sampleData: true,
		})
	]
});
```

Actions are `{ type: 'tool', title, tool, icon? }`, which opens a Studio tool in place (the tool name can include a path: `structure/page`), or `{ type: 'link', title, href, newTab?, icon? }`. Menus also take `{ type: 'reload' }` and `{ type: 'divider' }`. `DEFAULT_MENU` is exported, so you can spread it and add items.

### Fit it to the site, not the other way round

The package is site-agnostic. Its defaults are generic ("Overview", "Edit site" opening `presentation`, "View site", "Number of site visits"), and nothing in it assumes a store, a docs site or a specific Studio tool.

- **Put site-specific values in the app's `webVitals({...})` call**: names, tool names, URLs, wording, queries. Never edit the package to hard-code them.
- **If the site needs something the options can't express**, add an option to the package with a generic default, and document it here and in the README. Do not fork the pane or copy it into the app.
- **Fixed on purpose, not options**: the layout and Sanity UI styling, device colours, the preview's render size scaled to the card (chosen by the pane's own width, not the window's, like `sanity-preview-bar`'s devices: a 375×812 phone below 600px, a 768×1024 tablet below 1024px, 1440×900 desktop above; the card takes the device's shape), the card's footer (a progressive blur behind the title and buttons, stuck to the pane's bottom edge while the card runs past it, and the title's icon showing on card hover), and the Core Web Vitals rating thresholds (`good` ≤ 2.5 s LCP, ≤ 200 ms INP, ≤ 0.1 CLS). Change these in the package only for every site at once.

`previewUrl` should carry a flag the site reads to drop analytics, consent banners and popups for that request, so the preview is clean and is not counted. Add that check to the site. The plugin only loads the URL.

## 4. Server route

Every framework follows the same pattern: build a provider from the app's env, wrap it in `createWebVitalsHandler`, and mount it at the endpoint.

```ts
import { cloudflareWebAnalytics, createWebVitalsHandler } from 'sanity-plugin-web-vitals/server';

const handler = createWebVitalsHandler({
	provider: cloudflareWebAnalytics({ accountId, apiToken, host }),
	timeZone: 'America/Los_Angeles' // default 'UTC'
	// defaultRange: '30d',
	// cacheControl: 'public, max-age=60', // false to send none
});
// handler(request) -> Response
```

Read the reference file for the app's framework before writing the route:

- SvelteKit: [`references/sveltekit.md`](references/sveltekit.md)
- Next.js (App Router and Pages Router): [`references/nextjs.md`](references/nextjs.md)
- Cloudflare Workers, Hono, React Router and anything else that takes a `Request`: [`references/other.md`](references/other.md)

When env is read per request (SvelteKit's `$app/env/private`, the Workers `env` binding), build the handler inside the request function. Construction is cheap.

**Studio on another origin.** Wrap the response with CORS headers for that origin only, and answer `OPTIONS`:

```ts
const STUDIO_ORIGIN = 'https://my-project.sanity.studio';
const cors = { 'access-control-allow-origin': STUDIO_ORIGIN, vary: 'origin' };

export async function GET(request: Request) {
	const res = await handler(request);
	for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
	return res;
}
export const OPTIONS = () =>
	new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET' } });
```

The data is aggregate and non-personal, but do not use `*` without a reason.

## 5. Another data source

A provider is `{ name, getWebVitals({ range, windows, timeZone }) => Promise<WebVitals> }`. `windows` holds the current and previous periods, already resolved. `metric`, `rateLcp`, `rateInp`, `rateCls` and `changePercent` are exported so a new provider rates values with the same thresholds. Throw `WebVitalsError(status, message)` to choose the response status.

## 6. Verify

1. `curl -s 'http://localhost:<port>/api/web-vitals?range=7d' | jq .`. Expect `{ range, lcp, inp, cls, sessionsByDevice }`. A `{ message }` body names the failure:
   - 500 means credentials are missing.
   - 502 means Cloudflare refused the request (token scope, account ID) or returned no account.
   - 400 means the range is bad.
2. Open the Studio's Structure tool with nothing selected. The pane shows the strip and the preview. "Sample data. Web Vitals are not connected yet." means the endpoint did not return 200: check the browser Network tab for the endpoint URL and its status.
3. Live numbers stay empty (`value: null`) until the beacon has recorded page loads for `host`. A new site takes a few minutes of real traffic.
4. Confirm the preview iframe and the Presentation tool do not fire the beacon (no `cloudflareinsights` request from inside the frame).

## Pitfalls

- **Host mismatch.** `host` must match the recorded hostname exactly. `example.com` and `www.example.com` are different hosts.
- **Sampling.** Cloudflare's adaptive datasets sample multi-day queries on low-traffic sites. The provider already queries sessions and the CLS series one day at a time, and runs its two requests one after the other on purpose. Do not parallelize them.
- **Two landing panes.** Remove any other plugin that fills the Structure tool's empty pane (such as `sanity-plugin-blank-space`).
- **Secrets in the Studio bundle.** The Studio is a browser app. The token belongs only in the server route.
