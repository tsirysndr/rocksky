// test/index.spec.ts
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/** Capture the request the worker sends upstream, without touching the network. */
function stubUpstream(response = new Response('ok', { status: 200 })) {
	const calls: Request[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
		calls.push(new Request(input as Request, init));
		return response;
	});
	return calls;
}

describe('caramelo proxy', () => {
	it('forwards the request to caramelo.social.br, preserving path and query', async () => {
		const calls = stubUpstream();
		const request = new IncomingRequest('https://caramelo.rocksky.app/xrpc/com.atproto.server.describeServer?foo=bar');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		const upstream = new URL(calls[0].url);
		expect(upstream.host).toBe('caramelo.social.br');
		expect(upstream.pathname).toBe('/xrpc/com.atproto.server.describeServer');
		expect(upstream.search).toBe('?foo=bar');
		expect(calls[0].headers.get('X-Forwarded-Host')).toBe('caramelo.rocksky.app');

		vi.unstubAllGlobals();
	});

	it('preserves method, body and authorization on writes', async () => {
		const calls = stubUpstream(new Response(null, { status: 201 }));
		const request = new IncomingRequest('https://caramelo.rocksky.app/xrpc/com.atproto.repo.createRecord', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
			body: JSON.stringify({ repo: 'did:plc:test' }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(201);
		expect(calls[0].method).toBe('POST');
		expect(calls[0].headers.get('Authorization')).toBe('Bearer token');
		expect(await calls[0].json()).toEqual({ repo: 'did:plc:test' });

		vi.unstubAllGlobals();
	});

	it('passes redirects back to the client instead of following them', async () => {
		stubUpstream(new Response(null, { status: 302, headers: { Location: 'https://caramelo.social.br/elsewhere' } }));
		const request = new IncomingRequest('https://caramelo.rocksky.app/redirect-me');
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://caramelo.social.br/elsewhere');

		vi.unstubAllGlobals();
	});
});
