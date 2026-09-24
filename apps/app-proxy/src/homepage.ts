import { hasSessionHint, isAppHandoff } from '../../shared/homepage-routing';

export async function proxyHomepage(request: Request): Promise<Response | null> {
	const url = new URL(request.url);
	if (url.pathname !== '/' || !['GET', 'HEAD'].includes(request.method)) return null;
	const app = hasSessionHint(request.headers.get('Cookie') ?? '') || isAppHandoff(url);
	const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(request.headers.get('User-Agent') ?? '');
	const upstream = new URL(app ? (mobile ? 'https://m.rocksky.app' : 'https://rocksky.pages.dev') : 'https://rocksky-landing.pages.dev');
	// The browser retains the original URL for OAuth query parsing. Static HTML
	// origins do not need cookies, credentials, query values, or cache validators.
	try {
		const response = await fetch(upstream, {
			method: request.method,
			redirect: 'manual',
			cf: { cacheTtl: 0, cacheEverything: false },
		});
		if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Homepage unavailable');
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'private, no-store');
		headers.set('CDN-Cache-Control', 'no-store');
		headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
		headers.set('Vary', 'Cookie, User-Agent');
		for (const name of ['Set-Cookie', 'ETag', 'Last-Modified', 'Expires']) headers.delete(name);
		return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
	} catch {
		return new Response(request.method === 'HEAD' ? null : 'Rocksky is temporarily unavailable. Please reload.', {
			status: 502,
			headers: { 'Cache-Control': 'no-store' },
		});
	}
}
