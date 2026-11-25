# SvelteKit

Mount the handler as a `+server.ts` GET endpoint. SvelteKit passes a standard `Request` as `event.request`.

`src/routes/api/web-vitals/+server.ts`:

```ts
import {
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_ANALYTICS_API_TOKEN,
	CLOUDFLARE_WEB_ANALYTICS_HOST
} from '$env/static/private'; // or '$env/dynamic/private' / '$app/env/private', whichever the app uses
import { cloudflareWebAnalytics, createWebVitalsHandler } from 'sanity-plugin-web-vitals/server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) =>
	createWebVitalsHandler({
		provider: cloudflareWebAnalytics({
			accountId: CLOUDFLARE_ACCOUNT_ID ?? '',
			apiToken: CLOUDFLARE_ANALYTICS_API_TOKEN ?? '',
			host: CLOUDFLARE_WEB_ANALYTICS_HOST ?? ''
		}),
		timeZone: 'America/Los_Angeles'
	})(request);
```

Notes:

- Build the handler inside `GET` when env is read per request (`$env/dynamic/private`, Kit 3's `$app/env/private` with `defineEnvVars`). With `$env/static/private` it can be built once at module level.
- Do not wrap the response in Kit's `json()`. The handler already returns a `Response` with its own status and headers.
- On `@sveltejs/adapter-cloudflare`, keep the token a Worker secret (`wrangler secret put CLOUDFLARE_ANALYTICS_API_TOKEN`) and declare the other two under `vars` in `wrangler.jsonc`.
- An embedded Studio (`src/routes/studio/[...catchall]`, e.g. `@sanity/sveltekit`'s `SanityStudio`) shares the site's origin, so the plugin defaults work unchanged.
- Beacon: load it from the root `+layout.svelte` in `onMount`. Skip it when `window.self !== window.top` or the preview flag is in `page.url.searchParams`.
