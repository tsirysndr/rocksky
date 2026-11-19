import assert from "node:assert/strict";
import { test } from "node:test";
import {
  get,
  from_json,
  reader,
  metadata,
} from "../build/dev/javascript/rocksky_api/rocksky_api/nowplaying/submitted.mjs";
import { Ok } from "../build/dev/javascript/rocksky_api/gleam.mjs";

test("ListenBrainz submissions expose playback metadata, clamp elapsed and default optional fields", async () => {
  for (const [info, inserted, elapsed, device] of [
    [
      {
        duration_ms: 20000,
        music_service_name: "Pano",
        submission_client: "client",
      },
      1700000000,
      10000,
      "Pano",
    ],
    [
      { duration_ms: 5000, submission_client: "client" },
      1700000000,
      5000,
      "client",
    ],
    [{ duration_ms: 20000 }, 1700000020, 0, null],
    [{}, 1700000000, 0, null],
  ]) {
    const raw = JSON.stringify({
      inserted_at: inserted,
      track_metadata: {
        track_name: "Song",
        artist_name: "Artist",
        additional_info: info,
      },
    });
    assert.deepEqual(from_json(raw, 1700000010000), {
      album: null,
      title: "Song",
      artist: "Artist",
      length: info.duration_ms ?? 0,
      elapsed,
      is_playing: true,
      device_name: device,
    });
  }
  assert.deepEqual(
    from_json(
      JSON.stringify({
        track_metadata: { track_name: "Song", artist_name: "Artist" },
      }),
      1700000010000,
    ),
    {
      album: null,
      title: "Song",
      artist: "Artist",
      length: 0,
      elapsed: 0,
      is_playing: true,
      device_name: null,
    },
  );
  const keys = [];
  const result = await get(
    {
      redis: {
        async get(key) {
          keys.push(key);
          return null;
        },
      },
    },
    "did:test",
  );
  assert.ok(result instanceof Ok);
  assert.deepEqual(result[0], {});
  assert.deepEqual(keys, ["listenbrainz:playing_now:did:test"]);
});

test("submitted metadata uses catalog artwork and URIs, caches lookups and advances the clock", async (t) => {
  const realNow = Date.now;
  let now = 1700000010000;
  Date.now = () => now;
  t.after(() => {
    Date.now = realNow;
  });
  const { tables } = await import(
    "../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema_ffi.mjs"
  );
  const { getTableColumns } = await import("drizzle-orm");
  const columns = Object.values(getTableColumns(tables.tracks));
  const row = {
    xata_id: "track",
    title: "Song",
    artist: "Artist",
    album: "Album",
    album_artist: "Album Artist",
    album_art: "https://art.test/cover.jpg",
    duration: 20000,
    sha256: "hash",
    uri: "at://song",
    album_uri: "at://album",
    artist_uri: "at://artist",
    xata_createdat: "2026-01-01 00:00:00",
    xata_updatedat: "2026-01-01 00:00:00",
  };
  let queries = 0;
  const ctx = {
    db: {
      pool: {
        async query() {
          queries++;
          return { rows: [columns.map((c) => row[c.name] ?? null)] };
        },
      },
    },
    redis: {
      async get() {
        return JSON.stringify({
          inserted_at: 1700000000,
          track_metadata: {
            track_name: "Song",
            artist_name: "Artist",
            release_name: "Album",
          },
        });
      },
    },
    matching: {
      async post() {
        throw Error("catalog artwork should avoid providers");
      },
    },
  };
  const checked = await metadata(ctx, await ctx.redis.get());
  assert.ok(checked instanceof Ok, JSON.stringify(checked));
  queries = 0;
  const read = reader(ctx);
  let result = await read("did:test");
  assert.ok(result instanceof Ok);
  assert.equal(result[0].album_art, row.album_art);
  assert.equal(result[0].song_uri, "at://song");
  assert.equal(result[0].album_artist, "Album Artist");
  assert.equal(result[0].length, 20000);
  assert.equal(result[0].elapsed, 10000);
  now += 1000;
  result = await read("did:test");
  assert.equal(result[0].elapsed, 11000);
  assert.equal(queries, 1);
});

test("missing catalog artwork uses accepted matching results and tolerates provider failures", async () => {
  for (const status of ["matched", "ambiguous", "error"]) {
    const ctx = {
      db: {
        pool: {
          async query() {
            return { rows: [] };
          },
        },
      },
      redis: {
        async get() {
          return JSON.stringify({
            track_metadata: { track_name: "Song", artist_name: "Artist" },
          });
        },
      },
      matching: {
        async post(url, body, config) {
          assert.ok(config.signal);
          if (status === "error") throw Error("offline");
          return {
            data: {
              policyVersion: "1",
              status,
              track:
                status === "matched"
                  ? {
                      source: "spotify",
                      id: "id",
                      title: "Song",
                      artists: ["Artist"],
                      album: "Album",
                      albumArtist: "Artist",
                      albumArt: "https://art.test/provider.jpg",
                      durationMs: 30000,
                      identifiers: {},
                    }
                  : null,
              candidates: [],
              warnings: [],
            },
          };
        },
      },
    };
    const result = await get(ctx, "did:test");
    assert.ok(result instanceof Ok);
    assert.equal(result[0].title, "Song");
    assert.equal(
      result[0].album_art,
      status === "matched" ? "https://art.test/provider.jpg" : null,
    );
  }
});
