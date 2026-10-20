// test/index.spec.ts
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/** Capture the request (and its init) the worker sends upstream, without touching the network. */
function stubUpstream(response = new Response('ok', { status: 200 })) {
	const calls: { request: Request; init?: RequestInit }[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
		calls.push({ request: new Request(input as Request), init });
		return response;
	});
	return calls;
}

describe('listenbrainz proxy', () => {
	it('forwards the request to api.listenbrainz.org, preserving path and query', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/1/user/rocksky/listens?count=50&min_ts=1760000000');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		const upstream = new URL(calls[0].request.url);
		expect(upstream.host).toBe('api.listenbrainz.org');
		expect(upstream.pathname).toBe('/1/user/rocksky/listens');
		expect(upstream.search).toBe('?count=50&min_ts=1760000000');
		expect(calls[0].request.headers.get('X-Forwarded-Host')).toBe('listenbrainz.rocksky.app');

		vi.unstubAllGlobals();
	});

	it('identifies rocksky with a User-Agent, overriding whatever the client sent', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/1/user/rocksky/listens', {
			headers: { 'User-Agent': 'some-http-client/0.1' },
		});
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(calls[0].request.headers.get('User-Agent')).toBe('rocksky/1.0 ( https://rocksky.app )');

		vi.unstubAllGlobals();
	});

	it('caches anonymous GETs at the edge', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/1/user/rocksky/listens');
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const cf = (calls[0].init as { cf?: RequestInitCfProperties })?.cf;
		expect(cf?.cacheEverything).toBe(true);
		expect(cf?.cacheTtlByStatus).toEqual({ '200-299': 10, '404': 10, '500-599': 0 });

		vi.unstubAllGlobals();
	});

	it('never caches requests carrying an Authorization header', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/1/user/rocksky/listens', {
			headers: { Authorization: 'Token lb-token' },
		});
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect((calls[0].init as { cf?: unknown })?.cf).toBeUndefined();
		expect(calls[0].request.headers.get('Authorization')).toBe('Token lb-token');

		vi.unstubAllGlobals();
	});

	it('passes submissions through uncached, body intact', async () => {
		const calls = stubUpstream();
		const body = JSON.stringify({ listen_type: 'single', payload: [] });
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/1/submit-listens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: 'Token lb-token' },
			body,
		});
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(calls[0].request.method).toBe('POST');
		expect(await calls[0].request.text()).toBe(body);
		expect((calls[0].init as { cf?: unknown })?.cf).toBeUndefined();

		vi.unstubAllGlobals();
	});

	it('passes redirects back to the client instead of following them', async () => {
		stubUpstream(new Response(null, { status: 302, headers: { Location: 'https://api.listenbrainz.org/elsewhere' } }));
		const request = new IncomingRequest('https://listenbrainz.rocksky.app/redirect-me');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://api.listenbrainz.org/elsewhere');

		vi.unstubAllGlobals();
	});
});
