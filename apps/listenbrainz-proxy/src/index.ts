/**
 * Reverse proxy in front of https://api.listenbrainz.org.
 *
 * Every request is forwarded verbatim — same path, query, method, headers and
 * body — with only the host swapped, so `/1/user/{name}/listens` and
 * `/1/submit-listens` work unchanged. Redirects are passed back to the client
 * instead of being followed here.
 *
 * The `User-Agent` is always replaced with one that identifies Rocksky:
 * ListenBrainz asks callers to send a descriptive agent, and routing every
 * caller through this Worker is how we guarantee one regardless of what the
 * client library defaults to.
 *
 * Anonymous GETs are cached at the edge for a few seconds. The TTL stays well
 * under the mirror's 30s poll interval so a poll never reads a stale window,
 * while bursts of identical reads (several pollers, retries) collapse into one
 * upstream hit and stay clear of ListenBrainz's per-IP rate limit. Requests
 * carrying an Authorization header are never cached — their responses are
 * user-specific — and writes always pass through.
 *
 * - Run `npm run dev` to start a local server
 * - Run `npm run deploy` to publish
 */

const DEFAULT_UPSTREAM_HOST = 'api.listenbrainz.org';
const DEFAULT_USER_AGENT = 'rocksky/1.0 ( https://rocksky.app )';
const CACHE_TTL_SECONDS = 10;

export default {
	async fetch(request, env): Promise<Response> {
		const upstreamHost = env.UPSTREAM_HOST || DEFAULT_UPSTREAM_HOST;
		const userAgent = env.USER_AGENT || DEFAULT_USER_AGENT;

		const upstreamUrl = new URL(request.url);
		upstreamUrl.protocol = 'https:';
		upstreamUrl.host = upstreamHost;
		upstreamUrl.port = '';

		// `new Request(url, request)` keeps method/headers/body; the runtime
		// rewrites `Host` to match the new URL.
		const upstreamRequest = new Request(upstreamUrl, request);
		upstreamRequest.headers.set('User-Agent', userAgent);
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
					cacheTtlByStatus: { '200-299': CACHE_TTL_SECONDS, '404': CACHE_TTL_SECONDS, '500-599': 0 },
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
