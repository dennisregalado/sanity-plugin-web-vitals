# Next.js

## App Router

Route handlers take a standard `Request` and return a `Response`, so the handler is the export.

`app/api/web-vitals/route.ts`:

```ts
import { cloudflareWebAnalytics, createWebVitalsHandler } from 'sanity-plugin-web-vitals/server';

export const GET = createWebVitalsHandler({
	provider: cloudflareWebAnalytics({
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
		apiToken: process.env.CLOUDFLARE_ANALYTICS_API_TOKEN ?? '',
		host: process.env.CLOUDFLARE_WEB_ANALYTICS_HOST ?? ''
	}),
	timeZone: 'America/Los_Angeles'
});

// The handler sets its own Cache-Control; keep Next from statically caching the route at build.
export const dynamic = 'force-dynamic';
```

- Works on the Node and Edge runtimes (`export const runtime = 'edge'` is fine). It uses only `fetch`, `URL`, `Request`, `Response` and `Intl`.
- On Cloudflare (OpenNext or vinext), `process.env` is populated from Worker vars and secrets. Otherwise read them from `getCloudflareContext().env` inside a function and build the handler there.
- An embedded Studio (`app/studio/[[...tool]]/page.tsx` with `next-sanity`'s `NextStudio`) shares the origin, so the plugin defaults work unchanged.

## Pages Router

API routes get Node's `IncomingMessage`, not a `Request`. Prefer an App Router route handler; both routers can coexist. If the app must stay on Pages:

```ts
// pages/api/web-vitals.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { cloudflareWebAnalytics, createWebVitalsHandler } from 'sanity-plugin-web-vitals/server';

const handler = createWebVitalsHandler({
	provider: cloudflareWebAnalytics({
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
		apiToken: process.env.CLOUDFLARE_ANALYTICS_API_TOKEN ?? '',
		host: process.env.CLOUDFLARE_WEB_ANALYTICS_HOST ?? ''
	})
});

export default async function webVitals(req: NextApiRequest, res: NextApiResponse) {
	const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
	const response = await handler(new Request(url, { method: req.method }));
	response.headers.forEach((value, key) => res.setHeader(key, value));
	res.status(response.status).send(await response.text());
}
```

## Beacon

Load it with `next/script` in the root layout, from a client component that skips it when `window.self !== window.top` or the preview flag is in the URL.
