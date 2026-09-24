import { afterEach, expect, mock, test } from 'bun:test';
import { proxyHomepage } from '../src/homepage';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('selects the public shell for guests, sessions, mobile and auth handoffs', async () => {
	const cases = [
		['/', '', '', 'rocksky-landing.pages.dev'],
		['/', '', 'iPhone', 'rocksky-landing.pages.dev'],
		['/', 'rocksky_session_hint=1', '', 'rocksky.pages.dev'],
		['/', 'other=1; rocksky_session_hint=1', 'Android', 'm.rocksky.app'],
		['/', 'fake_rocksky_session_hint=1', '', 'rocksky-landing.pages.dev'],
		['/?did=did:plc:abc', '', '', 'rocksky.pages.dev'],
		['/?cli=1', '', '', 'rocksky.pages.dev'],
		['/?session=expired', '', 'iPhone', 'm.rocksky.app'],
		['/?__rocksky_app=1', '', '', 'rocksky.pages.dev'],
		['/?utm_source=test', '', '', 'rocksky-landing.pages.dev'],
	];
	for (const [path, cookie, agent, host] of cases) {
		globalThis.fetch = mock(async (input: unknown, options?: RequestInit) => {
			expect(String(input)).toBe(`https://${host}/`);
			expect(new Headers(options?.headers).has('Cookie')).toBe(false);
			expect(new Headers(options?.headers).has('Authorization')).toBe(false);
			expect(new Headers(options?.headers).has('If-None-Match')).toBe(false);
			return new Response('<html>shell</html>', {
				headers: {
					'Content-Type': 'text/html',
					'Cache-Control': 'public, max-age=3600',
					ETag: 'cached',
					'Set-Cookie': 'origin=1',
				},
			});
		}) as unknown as typeof fetch;
		const response = await proxyHomepage(
			new Request(`https://rocksky.app${path}`, {
				headers: { Cookie: cookie, 'User-Agent': agent, Authorization: 'Bearer secret', 'If-None-Match': 'cached' },
			}),
		);
		expect(await response?.text()).toBe('<html>shell</html>');
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie, User-Agent');
		expect(response?.headers.has('Set-Cookie')).toBe(false);
		expect(response?.headers.has('ETag')).toBe(false);
	}
});

test('leaves deep links, assets, APIs and non-read requests alone', async () => {
	const fetchMock = mock(async () => new Response('unexpected'));
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	for (const path of ['/oauth/callback', '/login', '/profile', '/@alice', '/assets/app.js', '/_landing/spotify.svg']) {
		expect(await proxyHomepage(new Request(`https://rocksky.app${path}`))).toBeNull();
	}
	expect(await proxyHomepage(new Request('https://rocksky.app/', { method: 'POST' }))).toBeNull();
	expect(fetchMock).not.toHaveBeenCalled();
});

test('preserves HEAD and fails without caching on upstream failure or redirect', async () => {
	globalThis.fetch = mock(async (_input: unknown, options?: RequestInit) => {
		expect(options?.method).toBe('HEAD');
		return new Response(null, { headers: { 'Content-Type': 'text/html' } });
	}) as unknown as typeof fetch;
	expect((await proxyHomepage(new Request('https://rocksky.app/', { method: 'HEAD' })))?.body).toBeNull();
	for (const upstream of [new Response(null, { status: 302 }), new Response('missing', { status: 404 }), new Response('oops')]) {
		globalThis.fetch = mock(async () => upstream) as unknown as typeof fetch;
		const response = await proxyHomepage(new Request('https://rocksky.app/'));
		expect(response?.status).toBe(502);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
	}
});
