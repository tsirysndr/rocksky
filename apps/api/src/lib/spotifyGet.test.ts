import { afterAll, afterEach, expect, it, spyOn } from "bun:test";
import { Effect } from "effect";
import { spotifyGet } from "./spotifyGet";

const fetchSpy = spyOn(globalThis, "fetch");
afterAll(() => {
  fetchSpy.mockRestore();
});
afterEach(() => {
  fetchSpy.mockReset();
});

it("does not retry a timed-out Spotify search", async () => {
  fetchSpy.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  await expect(
    spotifyGet("http://proxy/search", "token", "search"),
  ).rejects.toThrow("Timed out");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

it("aborts the active request when the enclosing Effect times out", async () => {
  let aborted = false;
  fetchSpy.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(options!.signal!.reason);
          },
          { once: true },
        );
      }),
  );
  await Effect.runPromiseExit(
    Effect.tryPromise({
      try: (signal) =>
        spotifyGet("http://proxy/search", "token", "search", signal),
      catch: (error) => error,
    }).pipe(Effect.timeout("20 millis")),
  );
  expect(aborted).toBe(true);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

it("cancels retry backoff without issuing another request", async () => {
  const controller = new AbortController();
  fetchSpy.mockImplementation(async () => {
    setTimeout(() => controller.abort(), 10);
    return new Response("", { status: 429, headers: { "retry-after": "1" } });
  });
  await expect(
    spotifyGet("http://proxy/search", "token", "search", controller.signal),
  ).rejects.toThrow();
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

it("does not start a request after its parent is already canceled", async () => {
  await expect(
    spotifyGet("http://proxy/search", "token", "search", AbortSignal.abort()),
  ).rejects.toThrow();
  expect(fetchSpy).toHaveBeenCalledTimes(0);
});

it("returns successful responses", async () => {
  fetchSpy.mockResolvedValue(Response.json({ tracks: { items: [] } }));
  expect(await spotifyGet("http://proxy/search", "token", "search")).toEqual({
    tracks: { items: [] },
  });
});
