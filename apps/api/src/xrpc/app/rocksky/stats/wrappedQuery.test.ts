import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Context } from "context";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Server } from "lexicon";
import pg from "pg";
import getActorAlbums from "../actor/getActorAlbums";
import getActorArtists from "../actor/getActorArtists";
import getWrapped from "./getWrapped";

// Uses session-local temporary tables only. No application data is modified.
const databaseUrl = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("wrapped and profile SQL (PostgreSQL)", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const handlers: Record<string, (request: { params: any }) => Promise<any>> =
    {};
  let queryCount = 0;
  beforeAll(async () => {
    await client.connect();
    await client.query(`
      SET timezone = 'UTC';
      CREATE TEMP TABLE users (xata_id text PRIMARY KEY, did text, handle text);
      CREATE TEMP TABLE artists (xata_id text PRIMARY KEY, name text, genres text[], picture text, sha256 text, uri text);
      CREATE TEMP TABLE albums (xata_id text PRIMARY KEY, title text, artist text, artist_uri text, album_art text, uri text, year int, release_date text, sha256 text);
      CREATE TEMP TABLE tracks (xata_id text PRIMARY KEY, title text, artist text, duration int, album_art text, uri text, artist_uri text, album_uri text);
      CREATE TEMP TABLE scrobbles (xata_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id text, timestamp timestamptz, track_id text, artist_id text, album_id text);
      INSERT INTO users VALUES ('u', 'did:test:u', 'listener.test');
      INSERT INTO artists (xata_id,name,genres) VALUES
        ('old','Old',ARRAY['rock','shared']), ('new','New',ARRAY['pop','shared','pop',NULL,'']),
        ('var','Various Artists',ARRAY['compilation']), ('future','Future',ARRAY['future']);
      INSERT INTO albums (xata_id,title,artist) VALUES ('a1','First','Old'),('a2','Second','New');
      INSERT INTO tracks (xata_id,title,artist,duration) VALUES
        ('t1','One','Old',120000),('t2','Two','New',180000),('t3','Three','New',NULL),('tv','Compilation','Various Artists',60000);
      INSERT INTO scrobbles (user_id,timestamp,track_id,artist_id,album_id) VALUES
        ('u','2023-12-31 23:59:59.999999+00','t1','old','a1'),
        ('other','2023-01-01+00','t2','new','a2'),
        ('u','2024-01-01 00:00:00+00','t1','old','a1'),
        ('u','2024-02-28 10:00:00+00','t2','new','a2'),
        ('u','2024-02-29 10:00:00+00','t2','new','a2'),
        ('u','2024-02-29 10:01:00+00','t3','new','a2'),
        ('u','2024-03-01 11:00:00+00','tv','var',NULL),
        ('u','2024-12-31 23:59:59.999999+00',NULL,NULL,NULL),
        ('u','2025-01-01 00:00:00+00','t1','future','a1'),
        ('other','2024-02-29 12:00:00+00','t2','new','a2');
    `);
    const ctx = {
      readDb: drizzle(client, {
        logger: {
          logQuery() {
            queryCount++;
          },
        },
      }),
    } as unknown as Context;
    const register = (name: string) => (config: any) => {
      handlers[name] = config.handler;
    };
    const server = {
      app: {
        rocksky: {
          stats: { getWrapped: register("wrapped") },
          actor: {
            getActorArtists: register("artists"),
            getActorAlbums: register("albums"),
          },
        },
      },
    } as unknown as Server;
    getWrapped(server, ctx);
    getActorArtists(server, ctx);
    getActorAlbums(server, ctx);
  });
  afterAll(async () => {
    await client.end();
  });

  it("preserves year boundaries, weighted genres, new artists, milestones and leap-day streaks", async () => {
    const { body } = await handlers.wrapped({
      params: { did: "did:test:u", year: 2024 },
    });
    expect(body.totalScrobbles).toBe(6);
    expect(body.totalListeningTimeMinutes).toBe(9);
    expect(body.topTracks[0]).toMatchObject({ id: "t2", playCount: 2 });
    expect(body.topArtists.map((a: any) => [a.id, a.playCount])).toEqual([
      ["new", 3],
      ["old", 1],
    ]);
    expect(body.topAlbums.map((a: any) => [a.id, a.playCount])).toEqual([
      ["a2", 3],
      ["a1", 1],
    ]);
    expect(body.topGenres).toEqual([
      { genre: "pop", count: 6 },
      { genre: "shared", count: 4 },
      { genre: "rock", count: 1 },
    ]);
    expect(body.newArtistsCount).toBe(2);
    expect(body.mostActiveDay).toEqual({ date: "2024-02-29", count: 2 });
    expect(body.mostActiveHour).toBe(10);
    expect(body.longestStreak).toBe(3);
    expect(body.scrobblesPerMonth).toEqual([
      { month: 1, count: 1 },
      { month: 2, count: 3 },
      { month: 3, count: 1 },
      { month: 12, count: 1 },
    ]);
    expect(body.period).toBe("year");
    expect(body.startDate).toBe("2024-01-01T00:00:00.000Z");
    expect(body.endDate).toBe("2025-01-01T00:00:00.000Z");
    expect(body.scrobblesPerDay).toEqual([
      { date: "2024-01-01", count: 1 },
      { date: "2024-02-28", count: 1 },
      { date: "2024-02-29", count: 2 },
      { date: "2024-03-01", count: 1 },
      { date: "2024-12-31", count: 1 },
    ]);
    expect(body.firstScrobble.timestamp).toBe("2024-01-01T00:00:00.000Z");
    expect(body.lastScrobble.timestamp).toBe("2024-03-01T11:00:00.000Z");
    const before = queryCount;
    expect(
      (await handlers.wrapped({ params: { year: 2024, did: "did:test:u" } }))
        .body,
    ).toEqual(body);
    expect(queryCount).toBe(before);
  });

  it("returns a valid empty wrapped for an empty year and an unknown actor", async () => {
    for (const params of [
      { did: "did:test:u", year: 2022 },
      { did: "unknown", year: 2024 },
    ]) {
      const { body } = await handlers.wrapped({ params });
      expect(body.totalScrobbles).toBe(0);
      expect(body.topGenres).toEqual([]);
      expect(body.scrobblesPerMonth).toEqual([]);
      expect(body.newArtistsCount).toBe(0);
      expect(body.longestStreak).toBe(0);
    }
  });

  it("computes rolling periods as a window ending now", async () => {
    const { body } = await handlers.wrapped({
      params: { did: "did:test:u", year: 2024, period: "week" },
    });
    expect(body.period).toBe("week");
    expect(
      new Date(body.endDate).getTime() - new Date(body.startDate).getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1000);
    expect(body.totalScrobbles).toBe(0);
  });

  it("keeps profile rankings, inclusive date filters and global listener counts", async () => {
    const params = {
      did: "listener.test",
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-02-29T12:00:00Z",
      limit: 1,
    };
    const artists = (await handlers.artists({ params })).body.artists;
    expect(artists).toHaveLength(1);
    expect(artists[0]).toMatchObject({
      id: "new",
      playCount: 3,
      uniqueListeners: 2,
    });
    const albums = (await handlers.albums({ params })).body.albums;
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      id: "a2",
      playCount: 3,
      uniqueListeners: 2,
    });
    expect(
      (await handlers.artists({ params: { ...params, offset: 1 } })).body
        .artists[0],
    ).toMatchObject({ id: "old", playCount: 1, uniqueListeners: 1 });
  });
});
