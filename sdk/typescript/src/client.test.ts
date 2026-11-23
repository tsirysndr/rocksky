import { afterEach, describe, expect, test } from "bun:test";

import { RockskyClient } from "./client.js";

const TOKEN = "test-token";

/**
 * Swap in a fetch that records the request instead of making one. The client
 * builds its fetch handler in the constructor, so install this first.
 */
function captureFetch(): {
	calls: Request[];
	only: () => Request;
	restore: () => void;
} {
	const calls: Request[] = [];
	const real = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push(new Request(input as RequestInfo, init));
		return new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof globalThis.fetch;
	return {
		calls,
		/** The single request that was made; fails loudly if there wasn't exactly one. */
		only: () => {
			expect(calls).toHaveLength(1);
			return calls[0] as Request;
		},
		restore: () => {
			globalThis.fetch = real;
		},
	};
}

let restore: (() => void) | null = null;
afterEach(() => {
	restore?.();
	restore = null;
});

describe("authenticated request headers", () => {
	test("a JSON procedure keeps its content-type alongside the bearer token", async () => {
		// Regression: the auth wrapper used to merge headers with an object spread.
		// atcute passes a Headers instance, which has no own enumerable properties,
		// so the spread produced `{}` and dropped the `application/json` content-type
		// atcute sets for a JSON body. The AppView then saw text/plain and replied
		// `InvalidRequest: Wrong request encoding (Content-Type): text/plain`.
		const cap = captureFetch();
		restore = cap.restore;

		const client = new RockskyClient("https://appview.test", TOKEN);
		await client.library().createPlaylist("Late night drive");

		const req = cap.only();
		expect(req.method).toBe("POST");
		expect(req.headers.get("content-type")).toBe("application/json");
		expect(req.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
		expect(await req.json()).toEqual({ name: "Late night drive" });
	});

	test("a query still carries the bearer token", async () => {
		const cap = captureFetch();
		restore = cap.restore;

		const client = new RockskyClient("https://appview.test", TOKEN);
		await client.library().getPlaylists();

		expect(cap.only().headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
	});

	test("no token means no authorization header", async () => {
		const cap = captureFetch();
		restore = cap.restore;

		const client = new RockskyClient("https://appview.test");
		await client.get("app.rocksky.actor.getProfile", { did: "did:plc:test" });

		expect(cap.only().headers.get("authorization")).toBeNull();
	});
});

describe("album listening intervals", () => {
  test("passes date bounds and pagination to the public album ranking", async () => {
    const cap = captureFetch();
    restore = cap.restore;
    const client = new RockskyClient("https://appview.test");
    await client.topAlbumsInterval(5, 2, {
      startDate: "2026-11-23T00:00:00.000Z",
      endDate: "2026-11-24T12:00:00.000Z",
    });
    const request = cap.only();
    const url = new URL(request.url);
    expect(url.pathname).toBe("/xrpc/app.rocksky.album.getAlbums");
    expect(url.searchParams.get("startDate")).toBe("2026-11-23T00:00:00.000Z");
    expect(url.searchParams.get("endDate")).toBe("2026-11-24T12:00:00.000Z");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("offset")).toBe("2");
    expect(request.headers.get("authorization")).toBeNull();
  });
});
