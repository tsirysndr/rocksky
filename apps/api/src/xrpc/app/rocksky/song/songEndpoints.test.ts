import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Context } from "context";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { Server } from "lexicon";
import pg from "pg";
import tables from "schema";
import getArtistAlbums from "../artist/getArtistAlbums";
import getSong from "./getSong";
import getScrobble from "../scrobble/getScrobble";

const databaseUrl = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "song and artist album endpoints (PostgreSQL)",
  () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    let song: (request: any) => Promise<any>;
    let scrobble: (request: any) => Promise<any>;
    let albums: (request: any) => Promise<any>;
    const queries: string[] = [];
    beforeAll(async () => {
      await client.connect();
      // Session-local tables isolate fixtures from any existing database data.
      for (const table of [
        tables.tracks,
        tables.artists,
        tables.albums,
        tables.userTracks,
        tables.scrobbles,
        tables.users,
        tables.lovedTracks,
        tables.artistAlbums,
      ]) {
        const { name, columns } = getTableConfig(table);
        const definitions = columns.map(
          (column) =>
            `"${column.name}" ${column.getSQLType()}${column.name.startsWith("xata_") && column.getSQLType().startsWith("timestamp") ? " DEFAULT '2024-01-01'" : ""}`,
        );
        await client.query(
          `CREATE TEMP TABLE "${name}" (${definitions.join(",")})`,
        );
      }
      await client.query(`
      INSERT INTO artists (xata_id,uri,name,genres) VALUES
        ('artist','at://artist','Artist',ARRAY['rock']),
        ('guest','at://guest','Guest',NULL);
      INSERT INTO users (xata_id,did,handle,avatar) VALUES
        ('u1','did:test:one','one.test','one.png'),
        ('u2','did:test:two','two.test','two.png');
      INSERT INTO tracks (xata_id,uri,title,artist,artist_uri,album,album_artist,duration,sha256,mb_id,isrc,spotify_link) VALUES
        ('track','at://track','Song','Artist, Guest','at://artist','Album','Artist',123000,'sha','mbid','isrc','https://open.spotify.com/track/spotify'),
        ('unplayed','at://unplayed','Unplayed','Artist','at://artist','Album','Artist',123000,'sha2',NULL,'isrc',NULL);
      INSERT INTO user_tracks (xata_id,user_id,track_id,uri) VALUES
        ('ut1','u1','track','at://user-one/track'),('ut2','u2','track','at://user-two/track');
      INSERT INTO albums (xata_id,uri,title,artist,sha256) VALUES
        ('album','at://album','Album','Artist','albumsha'),
        ('empty','at://empty','Empty','Artist','emptysha');
      INSERT INTO artist_albums (artist_id,album_id) VALUES ('artist','album'),('artist','empty');
      INSERT INTO scrobbles (xata_id,track_id,album_id,user_id,timestamp) VALUES
        ('s1','track','album','u1','2024-01-02'),
        ('s2','track','album','u2','2024-01-01'),
        ('s3','track','album','u1','2024-01-03'),
        ('s4',NULL,'album',NULL,'2024-01-04');
      INSERT INTO loved_tracks (track_id,user_id) VALUES ('track','u1');
    `);
      const db = drizzle(client, {
        logger: {
          logQuery(query) {
            queries.push(query);
          },
        },
      });
      const ctx = { readDb: db, db } as unknown as Context;
      const server = {
        app: {
          rocksky: {
            song: {
              getSong(config: any) {
                song = config.handler;
              },
            },
            scrobble: {
              getScrobble(config: any) {
                scrobble = config.handler;
              },
            },
            artist: {
              getArtistAlbums(config: any) {
                albums = config.handler;
              },
            },
          },
        },
      } as unknown as Server;
      getSong(server, ctx);
      getScrobble(server, ctx);
      getArtistAlbums(server, ctx);
    });
    afterAll(async () => {
      await client.end();
    });

    it("resolves canonical and user URIs plus external IDs with bounded song lookups", async () => {
      for (const params of [
        { uri: "at://track" },
        { uri: " at://user-two/track " },
        { mbid: "mbid" },
        { spotifyId: "spotify" },
        { uri: "missing", mbid: "mbid" },
      ]) {
        const { body } = await song({ params, auth: {} });
        expect(body.id).toBe("track");
        expect(body.mbId).toBe("mbid");
        expect(body.isrc).toBe("isrc");
        expect(body.playCount).toBe(3);
        expect(body.uniqueListeners).toBe(2);
        expect(body.firstScrobble.handle).toBe("two.test");
        expect(body.artists.map((a: any) => a.name)).toEqual([
          "Artist",
          "Guest",
        ]);
        expect(body.tags).toEqual(["rock"]);
        expect(body.likesCount).toBe(1);
        expect(body.liked).toBe(false);
      }
      const lookups = queries.filter((query) =>
        query.includes('left join "artists"'),
      );
      expect(lookups.length).toBe(5);
      expect(
        lookups.every(
          (q) =>
            q.includes('from "tracks"') &&
            q.includes("limit ") &&
            !q.includes('join "user_tracks"'),
        ),
      ).toBe(true);
      expect(["track", "unplayed"]).toContain(
        (await song({ params: { isrc: "isrc" }, auth: {} })).body.id,
      );
    });

    it("returns catalog tracks without user-track rows and keeps likes user-specific", async () => {
      const { body } = await song({
        params: { uri: "at://unplayed" },
        auth: {},
      });
      expect(body.id).toBe("unplayed");
      expect(body.uniqueListeners).toBe(0);
      expect(body.playCount).toBe(0);
      expect(body.firstScrobble).toBeUndefined();
      expect(
        (
          await song({
            params: { uri: "at://track" },
            auth: { credentials: { did: "did:test:one" } },
          })
        ).body.liked,
      ).toBe(true);
      expect(
        (
          await song({
            params: { uri: "at://track" },
            auth: { credentials: { did: "did:test:two" } },
          })
        ).body.liked,
      ).toBe(false);
    });

    it("returns camel-case identifiers for tracks and their scrobbles, omitting missing identifiers", async () => {
      await client.query(
        "UPDATE scrobbles SET uri = 'at://scrobble' WHERE xata_id = 's1'",
      );
      try {
        for (const [mbId, isrc] of [
          ["4330e262-40ee-4827-82d7-8fdf2c1f0c8a", "USWD10833901"],
          [null, "USWD10833901"],
          ["4330e262-40ee-4827-82d7-8fdf2c1f0c8a", null],
          [null, null],
          ["  ", ""],
        ]) {
          await client.query(
            "UPDATE tracks SET mb_id = $1, isrc = $2 WHERE xata_id = 'track'",
            [mbId, isrc],
          );
          for (const [handler, uri] of [
            [song, "at://track"],
            [scrobble, "at://scrobble"],
          ] as const) {
            const response = await handler({ params: { uri }, auth: {} });
            // Assert the JSON sent over the wire, not just an in-memory object.
            const body = JSON.parse(JSON.stringify(response.body));
            expect(body.title).toBe("Song");
            expect(body.mbId).toBe(mbId?.trim() || undefined);
            expect(body.isrc).toBe(isrc?.trim() || undefined);
            expect(Object.hasOwn(body, "mbId")).toBe(!!mbId?.trim());
            expect(Object.hasOwn(body, "isrc")).toBe(!!isrc?.trim());
          }
        }
      } finally {
        await client.query(
          "UPDATE tracks SET mb_id = 'mbid', isrc = 'isrc' WHERE xata_id = 'track'",
        );
      }
    });

    it("rejects missing songs and invalid input instead of returning an empty success", async () => {
      await expect(
        song({ params: { uri: "missing" }, auth: {} }),
      ).rejects.toThrow("Song not found");
      await expect(song({ params: { uri: " " }, auth: {} })).rejects.toThrow(
        "requires one of",
      );
    });

    it("shares concurrent album requests and counts plays and distinct listeners once", async () => {
      const start = queries.length;
      const [first, second] = await Promise.all([
        albums({ params: { uri: "at://artist" } }),
        albums({ params: { uri: "at://artist" } }),
      ]);
      expect(first).toEqual(second);
      expect(
        first.body.albums.map((a: any) => [
          a.id,
          a.playCount,
          a.uniqueListeners,
        ]),
      ).toEqual([
        ["album", 4, 2],
        ["empty", 0, 0],
      ]);
      expect(
        queries.slice(start).filter((q) => q.includes('from "scrobbles"')),
      ).toHaveLength(1);
      const afterLoad = queries.length;
      await albums({ params: { uri: "at://artist" } });
      expect(queries.length).toBe(afterLoad);
      expect(
        (await albums({ params: { uri: "unknown" } })).body.albums,
      ).toEqual([]);
      expect(
        (await albums({ params: { uri: "at://guest" } })).body.albums,
      ).toEqual([]);
    });

    it("propagates database failures and allows the next album request to recover", async () => {
      await client.query("ALTER TABLE artists RENAME TO artists_unavailable");
      try {
        await expect(albums({ params: { uri: "retry" } })).rejects.toThrow();
        await expect(
          song({ params: { mbid: "mbid" }, auth: {} }),
        ).rejects.toThrow();
      } finally {
        await client.query("ALTER TABLE artists_unavailable RENAME TO artists");
      }
      expect((await albums({ params: { uri: "retry" } })).body.albums).toEqual(
        [],
      );
    });
  },
);
