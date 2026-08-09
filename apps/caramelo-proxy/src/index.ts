/**
 * Reverse proxy in front of https://caramelo.social.br.
 *
 * Every request is forwarded verbatim — same path, query, method, headers and
 * body — with only the host swapped. Redirects are passed back to the client
 * instead of being followed here, so the client sees the origin's own
 * `Location`, and WebSocket upgrades (e.g. the ATProto firehose on
 * `/xrpc/com.atproto.sync.subscribeRepos`) are tunnelled through.
 *
 * - Run `npm run dev` to start a local server
 * - Run `npm run deploy` to publish
 */

const DEFAULT_UPSTREAM_HOST = 'caramelo.social.br';

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

		// A 101 response carries a `webSocket` that must be returned untouched,
		// and its headers are immutable — return it as-is.
		if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			return fetch(upstreamRequest);
		}

		const upstreamResponse = await fetch(upstreamRequest, { redirect: 'manual' });

		// Clone into a mutable response so headers can be adjusted downstream.
		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: upstreamResponse.headers,
		});
	},
} satisfies ExportedHandler<Env>;
