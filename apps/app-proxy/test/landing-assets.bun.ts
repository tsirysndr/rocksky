import { afterEach, describe, expect, mock, test } from 'bun:test';
import { proxyLandingAsset } from '../src/landing-assets';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('landing asset routing', () => {
	test('strips the prefix, preserves query and validators, and excludes credentials', async () => {
		let target = '';
		let options: RequestInit | undefined;
		globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
			target = String(input);
			options = init;
			return new Response('asset', { headers: { 'Content-Type': 'text/javascript', ETag: 'version', 'Set-Cookie': 'upstream=1' } });
		}) as unknown as typeof fetch;
		const response = await proxyLandingAsset(
			new Request('https://rocksky.app/_landing/assets/main.js?v=1', {
				headers: { Cookie: 'session=private', Authorization: 'Bearer private', 'If-None-Match': 'version' },
			}),
		);
		expect(target).toBe('https://rocksky-landing.pages.dev/assets/main.js?v=1');
		expect(new Headers(options?.headers).get('If-None-Match')).toBe('version');
		expect(new Headers(options?.headers).has('Cookie')).toBe(false);
		expect(new Headers(options?.headers).has('Authorization')).toBe(false);
		expect(response?.headers.has('Set-Cookie')).toBe(false);
		expect(await response?.text()).toBe('asset');
	});

	test('does not intercept app, API, or homepage requests', async () => {
		const fetchMock = mock(async () => new Response('unexpected'));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		for (const path of ['/', '/assets/app.js', '/login', '/oauth/callback', '/_landing-other/main.js']) {
			expect(await proxyLandingAsset(new Request(`https://rocksky.app${path}`))).toBeNull();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('rejects writes without contacting the upstream', async () => {
		const fetchMock = mock(async () => new Response('unexpected'));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const response = await proxyLandingAsset(new Request('https://rocksky.app/_landing/file', { method: 'POST' }));
		expect(response?.status).toBe(405);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('returns 404 for an SPA fallback and upstream redirects', async () => {
		for (const response of [
			new Response('<html />', { headers: { 'Content-Type': 'text/html' } }),
			new Response(null, { status: 302, headers: { Location: '/' } }),
		]) {
			globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
			expect((await proxyLandingAsset(new Request('https://rocksky.app/_landing/missing.js')))?.status).toBe(404);
		}
	});

	test('preserves HEAD and 304 responses', async () => {
		globalThis.fetch = mock(async (_input: unknown, options?: RequestInit) => {
			expect(options?.method).toBe('HEAD');
			return new Response(null, { status: 304, headers: { ETag: 'version' } });
		}) as unknown as typeof fetch;
		const response = await proxyLandingAsset(new Request('https://rocksky.app/_landing/assets/main.js', { method: 'HEAD' }));
		expect(response?.status).toBe(304);
		expect(response?.body).toBeNull();
	});

	test('handles upstream outages', async () => {
		globalThis.fetch = mock(async () => {
			throw new Error('unreachable');
		}) as unknown as typeof fetch;
		const response = await proxyLandingAsset(new Request('https://rocksky.app/_landing/assets/main.js'));
		expect(response?.status).toBe(502);
		expect(response?.headers.get('Cache-Control')).toBe('no-store');
	});
});
