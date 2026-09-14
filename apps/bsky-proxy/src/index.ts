/**
 * Reverse proxy in front of https://public.api.bsky.app (the public Bluesky
 * AppView).
 *
 * Every request is forwarded verbatim — same path, query, method, headers and
 * body — with only the host swapped. Redirects are passed back to the client
 * instead of being followed here.
 *
 * Anonymous GET responses (profiles, feeds) are cached at the edge for a
 * minute, which absorbs AppView latency spikes and rate limits without
 * serving stale data for long. Requests carrying an Authorization header are
 * never cached — their responses are viewer-specific.
 *
 * - Run `npm run dev` to start a local server
 * - Run `npm run deploy` to publish
 */

const DEFAULT_UPSTREAM_HOST = 'public.api.bsky.app';

export default {
	async fetch(request, env): Promise<Response> {
		const upstreamHost = env.UPSTREAM_HOST || DEFAULT_UPSTREAM_HOST;

		const upstreamUrl = new URL(request.url);
		upstreamUrl.protocol = 'https:';
		upstreamUrl.host = upstreamHost;
		upstreamUrl.port = '';

		// `new Request(url, request)` keeps method/headers/body; the runtime
		// rewrites `Host` to match the new URL.
		const upstreamRequest = new Request(upstreamUrl, request);
		// Preserve the hostname the client actually asked for, so the origin can
		// build absolute URLs (and log) against the proxy rather than itself.
		upstreamRequest.headers.set('X-Forwarded-Host', new URL(request.url).host);
		upstreamRequest.headers.set('X-Forwarded-Proto', 'https');

		const cacheable = request.method === 'GET' && !request.headers.has('Authorization');
		const upstreamResponse = await fetch(upstreamRequest, {
			redirect: 'manual',
			...(cacheable && {
				cf: {
					cacheEverything: true,
					cacheTtlByStatus: { '200-299': 60, '404': 60, '500-599': 0 },
				},
			}),
		});

		// Clone into a mutable response so headers can be adjusted downstream.
		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: upstreamResponse.headers,
		});
	},
} satisfies ExportedHandler<Env>;
