# Workers, Hono, React Router and others

Anything that hands over a standard `Request` can call the handler directly.

## Cloudflare Workers

Workers bindings arrive per request, so build the handler inside `fetch`:

```ts
import { cloudflareWebAnalytics, createWebVitalsHandler } from 'sanity-plugin-web-vitals/server';

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/api/web-vitals') {
			return createWebVitalsHandler({
				provider: cloudflareWebAnalytics({
					accountId: env.CLOUDFLARE_ACCOUNT_ID,
					apiToken: env.CLOUDFLARE_ANALYTICS_API_TOKEN,
					host: env.CLOUDFLARE_WEB_ANALYTICS_HOST
				}),
				timeZone: 'America/Los_Angeles'
			})(request);
		}
		return new Response('Not found', { status: 404 });
	}
} satisfies ExportedHandler<Env>;
```

You can also import `env` from `cloudflare:workers` and build the handler at module level.

## Hono

```ts
app.get('/api/web-vitals', (c) =>
	createWebVitalsHandler({
		provider: cloudflareWebAnalytics({
			accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
			apiToken: c.env.CLOUDFLARE_ANALYTICS_API_TOKEN,
			host: c.env.CLOUDFLARE_WEB_ANALYTICS_HOST
		})
	})(c.req.raw)
);
```

## React Router 7 / Remix

A resource route (no default export) whose loader returns the handler's `Response`:

```ts
// app/routes/api.web-vitals.ts
export const loader = ({ request, context }: Route.LoaderArgs) =>
	createWebVitalsHandler({
		provider: cloudflareWebAnalytics({
			accountId: context.cloudflare.env.CLOUDFLARE_ACCOUNT_ID,
			apiToken: context.cloudflare.env.CLOUDFLARE_ANALYTICS_API_TOKEN,
			host: context.cloudflare.env.CLOUDFLARE_WEB_ANALYTICS_HOST
		})
	})(request);
```

Read env from wherever the app's server context exposes it (`process.env` on Node).

## Express / Node `http`

Convert the request with the framework's Fetch adapter, e.g. `@hono/node-server`, or build `new Request(url, { method })` by hand as in the Next.js Pages Router example. Then copy the `Response`'s status, headers and body back.
