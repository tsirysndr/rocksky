const PREFIX = '/_landing/';
const LANDING_ORIGIN = 'https://rocksky-landing.pages.dev';

/** Asset routing is independent of authentication and desktop/mobile routing. */
export async function proxyLandingAsset(request: Request): Promise<Response | null> {
	const url = new URL(request.url);
	if (!url.pathname.startsWith(PREFIX)) return null;
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
	}
	const upstream = new URL(LANDING_ORIGIN);
	upstream.pathname = url.pathname.slice(PREFIX.length - 1);
	upstream.search = url.search;
	// Forward cache validators, never a visitor's session or authorization.
	const headers = new Headers();
	for (const name of ['Accept', 'If-None-Match', 'If-Modified-Since', 'Range', 'If-Range']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	try {
		const response = await fetch(upstream, { method: request.method, headers, redirect: 'manual' });
		// Pages can return its SPA shell for missing files. Never serve that as
		// JavaScript/CSS or redirect an asset outside the landing namespace.
		if (
			(response.status >= 300 && response.status < 400 && response.status !== 304) ||
			response.headers.get('Content-Type')?.toLowerCase().includes('text/html')
		) {
			return new Response(request.method === 'HEAD' ? null : 'Asset not found', {
				status: 404,
				headers: { 'Cache-Control': 'no-store' },
			});
		}
		const responseHeaders = new Headers(response.headers);
		responseHeaders.delete('Set-Cookie');
		return new Response(request.method === 'HEAD' ? null : response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		});
	} catch {
		return new Response(request.method === 'HEAD' ? null : 'Landing assets unavailable', {
			status: 502,
			headers: { 'Cache-Control': 'no-store' },
		});
	}
}
