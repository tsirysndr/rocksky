import { expect, mock, test } from "bun:test";

let finishFingerprint;
const fingerprint = mock(
  () =>
    new Promise((resolve) => {
      finishFingerprint = resolve;
    }),
);
mock.module("../modules/rocksky-engine", () => ({
  localMusicNative: { fingerprint },
}));
mock.module("expo-constants", () => ({
  default: { expoConfig: { extra: { acoustidClientKey: "test-client" } } },
}));
const { identifyDeviceTrack } = await import(
  "../src/lib/deviceMusicIdentification"
);

test("a track collection cannot be submitted for identification", async () => {
  await expect(
    identifyDeviceTrack([{ id: "one" }, { id: "two" }], "fingerprint"),
  ).rejects.toThrow("one local track");
  expect(fingerprint).not.toHaveBeenCalled();
});

test("identification processes one selected track and refuses concurrent identification", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const id = "4330e262-40ee-4827-82d7-8fdf2c1f0c8a";
  globalThis.fetch = mock(async (url, init) => {
    requests.push({ url, init });
    return Response.json(
      url.includes("acoustid.org")
        ? { status: "ok", results: [{ score: 0.95, recordings: [{ id }] }] }
        : {
            id,
            title: "Identified song",
            "artist-credit": [{ name: "Artist" }],
            releases: [{ title: "Album", date: "2020-01-01" }],
          },
    );
  });
  try {
    const selected = { id: "one", durationMs: 200000, title: "" };
    const pending = identifyDeviceTrack(selected, "fingerprint");
    await expect(
      identifyDeviceTrack({ id: "two", durationMs: 180000 }, "fingerprint"),
    ).rejects.toThrow("current track");
    expect(fingerprint.mock.calls).toEqual([["one"]]);
    finishFingerprint("encoded-fingerprint");
    const result = await pending;
    expect(requests).toHaveLength(2);
    expect(new URLSearchParams(requests[0].init.body).get("fingerprint")).toBe(
      "encoded-fingerprint",
    );
    expect(result[0]).toMatchObject({
      title: "Identified song",
      artist: "Artist",
      album: "Album",
      mbId: id,
    });
    expect(selected.title).toBe(""); // Suggestions do not modify the selected track.
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("text search does not fingerprint audio and can run after the previous lookup", async () => {
  const originalFetch = globalThis.fetch;
  const count = fingerprint.mock.calls.length;
  globalThis.fetch = mock(async () => Response.json({ recordings: [] }));
  try {
    expect(
      await identifyDeviceTrack({ id: "two" }, "search", "Artist Song"),
    ).toEqual([]);
    expect(fingerprint.mock.calls.length).toBe(count);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
