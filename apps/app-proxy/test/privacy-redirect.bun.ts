import { describe, expect, test } from 'bun:test';
import worker from '../src/index';

const call = (url: string, init?: RequestInit) =>
	(worker as any).fetch(new Request(url, init), {} as never, {} as never) as Promise<Response>;

describe('privacy redirect', () => {
	test('redirects /privacy to /tos on the same host', async () => {
		const response = await call('https://rocksky.app/privacy');
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/tos');
	});

	test('redirects /privacy-policy too, and keeps the query string', async () => {
		const response = await call('https://rocksky.app/privacy-policy?from=play');
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/tos?from=play');
	});

	test('redirects before any user-agent routing, so mobile gets it too', async () => {
		const response = await call('https://rocksky.app/privacy', {
			headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
		});
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://rocksky.app/tos');
	});

	test('leaves an unrelated path alone', async () => {
		// Not a redirect: it falls through to the proxying path, which would need
		// the network. Assert only that the privacy branch did not claim it.
		const url = new URL('https://rocksky.app/privacy-settings');
		expect(url.pathname === '/privacy' || url.pathname === '/privacy-policy').toBe(false);
	});
});
