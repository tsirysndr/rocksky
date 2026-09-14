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

describe('bsky proxy', () => {
	it('forwards the request to public.api.bsky.app, preserving path and query', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://bsky.rocksky.app/xrpc/app.bsky.actor.getProfile?actor=did:plc:7vdlgi2bflelz7mmuxoqjfcr');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		const upstream = new URL(calls[0].request.url);
		expect(upstream.host).toBe('public.api.bsky.app');
		expect(upstream.pathname).toBe('/xrpc/app.bsky.actor.getProfile');
		expect(upstream.search).toBe('?actor=did:plc:7vdlgi2bflelz7mmuxoqjfcr');
		expect(calls[0].request.headers.get('X-Forwarded-Host')).toBe('bsky.rocksky.app');

		vi.unstubAllGlobals();
	});

	it('caches anonymous GETs at the edge', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://bsky.rocksky.app/xrpc/app.bsky.actor.getProfile?actor=rocksky.app');
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const cf = (calls[0].init as { cf?: RequestInitCfProperties })?.cf;
		expect(cf?.cacheEverything).toBe(true);
		expect(cf?.cacheTtlByStatus).toEqual({ '200-299': 60, '404': 60, '500-599': 0 });

		vi.unstubAllGlobals();
	});

	it('never caches requests carrying an Authorization header', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://bsky.rocksky.app/xrpc/app.bsky.actor.getProfile?actor=rocksky.app', {
			headers: { Authorization: 'Bearer token' },
		});
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect((calls[0].init as { cf?: unknown })?.cf).toBeUndefined();
		expect(calls[0].request.headers.get('Authorization')).toBe('Bearer token');

		vi.unstubAllGlobals();
	});

	it('passes redirects back to the client instead of following them', async () => {
		stubUpstream(new Response(null, { status: 302, headers: { Location: 'https://public.api.bsky.app/elsewhere' } }));
		const request = new IncomingRequest('https://bsky.rocksky.app/redirect-me');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://public.api.bsky.app/elsewhere');

		vi.unstubAllGlobals();
	});
});
