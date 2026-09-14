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

describe('plc proxy', () => {
	it('forwards the request to plc.directory, preserving path and query', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://plc.rocksky.app/did:plc:7vdlgi2bflelz7mmuxoqjfcr');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		const upstream = new URL(calls[0].request.url);
		expect(upstream.host).toBe('plc.directory');
		expect(upstream.pathname).toBe('/did:plc:7vdlgi2bflelz7mmuxoqjfcr');
		expect(calls[0].request.headers.get('X-Forwarded-Host')).toBe('plc.rocksky.app');

		vi.unstubAllGlobals();
	});

	it('caches GETs at the edge', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://plc.rocksky.app/did:plc:7vdlgi2bflelz7mmuxoqjfcr');
		const ctx = createExecutionContext();

		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const cf = (calls[0].init as { cf?: RequestInitCfProperties })?.cf;
		expect(cf?.cacheEverything).toBe(true);
		expect(cf?.cacheTtlByStatus).toEqual({ '200-299': 300, '404': 60, '500-599': 0 });

		vi.unstubAllGlobals();
	});

	it('passes writes through uncached, preserving method and body', async () => {
		const calls = stubUpstream(new Response(null, { status: 200 }));
		const request = new IncomingRequest('https://plc.rocksky.app/did:plc:7vdlgi2bflelz7mmuxoqjfcr', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'plc_operation' }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(calls[0].request.method).toBe('POST');
		expect((calls[0].init as { cf?: unknown })?.cf).toBeUndefined();
		expect(await calls[0].request.json()).toEqual({ type: 'plc_operation' });

		vi.unstubAllGlobals();
	});

	it('passes redirects back to the client instead of following them', async () => {
		stubUpstream(new Response(null, { status: 302, headers: { Location: 'https://plc.directory/elsewhere' } }));
		const request = new IncomingRequest('https://plc.rocksky.app/redirect-me');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://plc.directory/elsewhere');

		vi.unstubAllGlobals();
	});
});
