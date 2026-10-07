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
  default: {
    expoConfig: {
      version: "2.1.2",
      extra: { acoustidClientKey: "test-client" },
    },
  },
}));
const { identifyDeviceTrack, identifyDeviceTracks, enrichMetadataSuggestion } =
  await import("../src/lib/deviceMusicIdentification");

test("the single-track lookup rejects collections; selections use the queue API", async () => {
  await expect(
    identifyDeviceTrack([{ id: "one" }, { id: "two" }], "fingerprint"),
  ).rejects.toThrow("one local track");
  expect(fingerprint).not.toHaveBeenCalled();
});

test("the selected release keeps its year and takes priority for artwork", async () => {
  const originalFetch = globalThis.fetch;
  const releaseId = "4330e262-40ee-4827-82d7-8fdf2c1f0c8a";
  globalThis.fetch = mock(async (url) =>
    Response.json(
      url.includes("matchSong")
        ? {
            title: "Song",
            artist: "Artist",
            album: "Album",
            year: 1990,
            albumArt: "https://example.com/other-edition.jpg",
          }
        : {
            images: [
              {
                front: true,
                thumbnails: { 500: "https://example.com/chosen-edition.jpg" },
              },
            ],
          },
    ),
  );
  try {
    const result = await enrichMetadataSuggestion({
      title: "Song",
      artist: "Artist",
      album: "Album",
      albumArtist: "Artist",
      mbId: "",
      releaseId,
      year: 2020,
      source: "MusicBrainz",
    });
    expect(result.year).toBe(2020);
    expect(result.albumArt).toBe("https://example.com/chosen-edition.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    expect(requests[0].url).toBe("https://api.acoustid.org/v2/lookup");
    for (const request of requests) {
      expect(new Headers(request.init.headers).get("User-Agent")).toBe(
        "Rocksky/2.1.2 (https://rocksky.app)",
      );
    }
    expect(new Headers(requests[0].init.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
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
    expect(
      new Headers(globalThis.fetch.mock.calls[0][1].headers).get("User-Agent"),
    ).toBe("Rocksky/2.1.2 (https://rocksky.app)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("selected tracks are deduplicated, identified serially and failures do not discard other results", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  fingerprint.mockImplementation(async (id) => {
    calls.push(id);
    if (id === "broken") throw new Error("Unsupported audio");
    return `fingerprint-${id}`;
  });
  globalThis.fetch = mock(async () =>
    Response.json({ status: "ok", results: [] }),
  );
  try {
    const progress = [];
    const tracks = ["first", "broken", "last", "first"].map((id) => ({
      id,
      durationMs: 180000,
    }));
    const results = await identifyDeviceTracks(tracks, {
      onProgress: (value) => progress.push(value),
    });
    expect(calls).toEqual(["first", "broken", "last"]);
    expect(results).toHaveLength(3);
    expect(results[1].error).toBe("Unsupported audio");
    expect(results[2].suggestions).toEqual([]);
    expect(progress.at(-1)).toMatchObject({ total: 3, completed: 3 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancelling during a fingerprint stops lookup and all remaining selected tracks", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const calls = [];
  fingerprint.mockImplementation(async (id) => {
    calls.push(id);
    controller.abort();
    return "fingerprint";
  });
  globalThis.fetch = mock(async () => Response.json({}));
  try {
    await expect(
      identifyDeviceTracks(
        [
          { id: "first", durationMs: 180000 },
          { id: "second", durationMs: 180000 },
        ],
        { signal: controller.signal },
      ),
    ).rejects.toThrow("cancelled");
    expect(calls).toEqual(["first"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Rocksky match supplies cover and extra fields without modifying the suggestion", async () => {
  const originalFetch = globalThis.fetch;
  const candidate = {
    title: "Song",
    artist: "Artist",
    album: "Album",
    albumArtist: "Artist",
    mbId: "",
    source: "MusicBrainz",
  };
  globalThis.fetch = mock(async () =>
    Response.json({
      title: "Song",
      artist: "Artist",
      album: "Album",
      albumArt: "https://example.com/cover.jpg",
      genres: ["Rock"],
      year: 2001,
      trackNumber: 3,
      discNumber: 1,
    }),
  );
  try {
    const enriched = await enrichMetadataSuggestion(candidate);
    expect(enriched).toMatchObject({
      albumArt: "https://example.com/cover.jpg",
      genre: "Rock",
      year: 2001,
      trackNumber: 3,
      discNumber: 1,
    });
    expect(candidate.albumArt).toBeUndefined();
    expect(globalThis.fetch.mock.calls[0][0]).toContain(
      "/xrpc/app.rocksky.song.matchSong?",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a different Rocksky album cannot replace the chosen release; cover search uses its release ID", async () => {
  const originalFetch = globalThis.fetch;
  const releaseId = "4330e262-40ee-4827-82d7-8fdf2c1f0c8a";
  globalThis.fetch = mock(async (url) =>
    Response.json(
      url.includes("matchSong")
        ? {
            title: "Song",
            artist: "Artist",
            album: "Other album",
            albumArt: "https://example.com/wrong.jpg",
            year: 1999,
          }
        : {
            images: [
              { front: false, image: "https://example.com/back.jpg" },
              {
                front: true,
                thumbnails: { 500: "http://coverartarchive.org/front.jpg" },
              },
            ],
          },
    ),
  );
  try {
    const enriched = await enrichMetadataSuggestion({
      title: "Song",
      artist: "Artist",
      album: "Chosen album",
      albumArtist: "Artist",
      mbId: "",
      releaseId,
      source: "MusicBrainz",
    });
    expect(enriched.album).toBe("Chosen album");
    expect(enriched.year).toBeUndefined();
    expect(enriched.albumArt).toBe("https://coverartarchive.org/front.jpg");
    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      `https://coverartarchive.org/release/${releaseId}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
