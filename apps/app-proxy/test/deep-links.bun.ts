import { afterEach, expect, mock, test } from 'bun:test';
import worker from '../src/index';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('keeps encoded scrobble links in the app for guests and signed-in visitors', async () => {
	const path = '/did%3Aplc%3A4ogq4k7a6bzpqabiwnleelq4/scrobble/3mwgvxu5dys22';
	for (const cookie of ['', 'rocksky_session_hint=1']) {
		for (const agent of ['Chrome', 'Android Chrome']) {
			const appOrigin = agent.includes('Android') ? 'https://m.rocksky.app' : 'https://rocksky.pages.dev';
			const requested: string[] = [];
			globalThis.fetch = mock(async (input: URL | RequestInfo) => {
				const url = String(input);
				requested.push(url);
				if (url === `${appOrigin}${path}`) {
					return new Response('<html>app shell</html>', { headers: { 'Content-Type': 'text/html' } });
				}
				if (url.startsWith('https://api.rocksky.app/public/og?')) {
					// Missing preview metadata must not redirect the navigation.
					return new Response(null, { status: 404 });
				}
				throw new Error(`Unexpected upstream: ${url}`);
			}) as typeof fetch;
			const response = await worker.fetch(
				new Request(`https://rocksky.app${path}`, { headers: { Cookie: cookie, 'User-Agent': agent } }),
				{} as Env,
				{} as ExecutionContext,
			);
			expect(response.status).toBe(200);
			expect(response.headers.has('Location')).toBe(false);
			expect(await response.text()).toBe('<html>app shell</html>');
			expect(requested[0]).toBe(`${appOrigin}${path}`);
			expect(requested).toHaveLength(2);
		}
	}
});
