import { describe, expect, test } from 'bun:test';
import worker from '../src/index';

const call = (url: string, init?: RequestInit) =>
	(worker as any).fetch(new Request(url, init), {} as never, {} as never) as Promise<Response>;

describe('privacy routing', () => {
	test('/privacy is served by the app, never redirected', async () => {
		// A redirect here would shadow the real privacy page in web / web-mobile,
		// so assert the proxy does not claim the path. Falling through needs the
		// network, so stub it and check where the request was pointed instead.
		const originalFetch = globalThis.fetch;
		let target = '';
		globalThis.fetch = (async (input: unknown) => {
			const requested = String(input);
			// The OG lookup is a separate hop; let it miss so the shell is returned as-is.
			if (requested.includes('/public/og')) return new Response('missing', { status: 404 });
			target = requested;
			return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
		}) as unknown as typeof fetch;
		try {
			const response = await call('https://rocksky.app/privacy');
			expect(response.status).toBe(200);
			expect(target).toContain('/privacy');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('redirects the alternate /privacy-policy spelling to /privacy', async () => {
		const response = await call('https://rocksky.app/privacy-policy');
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/privacy');
	});

	test('keeps the query string on that redirect', async () => {
		const response = await call('https://rocksky.app/privacy-policy?from=play');
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/privacy?from=play');
	});

	test('redirects before user-agent routing, so mobile gets it too', async () => {
		const response = await call('https://rocksky.app/privacy-policy', {
			headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
		});
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/privacy');
	});
});
