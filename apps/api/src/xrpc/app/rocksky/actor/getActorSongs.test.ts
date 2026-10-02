import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Context } from "context";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Server } from "lexicon";
import pg from "pg";
import getActorSongs from "./getActorSongs";

const databaseUrl = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("profile Top Tracks (PostgreSQL)", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  let handler: (request: { params: any }) => Promise<any>;
  let queries = 0;
  beforeAll(async () => {
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE users (xata_id text PRIMARY KEY, did text, handle text);
      CREATE TEMP TABLE tracks (
        xata_id text PRIMARY KEY, title text, artist text, album_artist text,
        album_art text, album text, uri text, album_uri text, artist_uri text,
        sha256 text, track_number int, disc_number int, duration int,
        copyright_message text, xata_createdat timestamp DEFAULT '2024-01-01'
      );
      CREATE TEMP TABLE scrobbles (
        xata_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id text, track_id text, timestamp timestamptz
      );
      INSERT INTO users VALUES ('u','did:test:u','listener.test');
      INSERT INTO tracks (xata_id,title,artist,duration) VALUES ('a','One','Artist',120000),('b','Two','Artist',180000);
      INSERT INTO scrobbles (user_id,track_id,timestamp) VALUES
        ('u','a','2024-01-01T00:00:00Z'), ('u','a','2024-02-01T00:00:00Z'),
        ('u','b','2024-02-01T01:00:00Z'), ('u','b','2024-02-02T00:00:00Z'),
        ('u','b','2024-02-02T00:00:01Z'), ('other','a','2024-02-01T00:00:00Z'),
        ('other','b','2023-01-01T00:00:00Z'), ('u',NULL,'2024-01-01T00:00:00Z');
    `);
    const ctx = {
      readDb: drizzle(client, {
        logger: {
          logQuery() {
            queries++;
          },
        },
      }),
    } as unknown as Context;
    const server = {
      app: {
        rocksky: {
          actor: {
            getActorSongs(config: any) {
              handler = config.handler;
            },
          },
        },
      },
    } as unknown as Server;
    getActorSongs(server, ctx);
  });
  afterAll(async () => {
    await client.end();
  });

  it("returns profile play counts, global listener counts, and shares concurrent requests", async () => {
    const before = queries;
    const params = { did: "did:test:u", limit: 20 };
    const [first, second] = await Promise.all([
      handler({ params }),
      handler({ params: { ...params } }),
    ]);
    expect(
      first.body.tracks.map((t: any) => [t.id, t.playCount, t.uniqueListeners]),
    ).toEqual([
      ["b", 3, 2],
      ["a", 2, 2],
    ]);
    expect(first.body.tracks[0].createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(first.body).toEqual(second.body);
    const afterLoad = queries;
    expect(afterLoad > before).toBe(true);
    await handler({ params });
    expect(queries).toBe(afterLoad);
  });

  it("applies inclusive date bounds to both plays and global listeners", async () => {
    const { body } = await handler({
      params: {
        did: "listener.test",
        startDate: "2024-02-01T00:00:00Z",
        endDate: "2024-02-02T00:00:00Z",
      },
    });
    expect(
      body.tracks.map((t: any) => [t.id, t.playCount, t.uniqueListeners]),
    ).toEqual([
      ["b", 2, 1],
      ["a", 1, 2],
    ]);
  });

  it("preserves pagination and empty-result behavior", async () => {
    const { body } = await handler({
      params: { did: "listener.test", limit: 1, offset: 1 },
    });
    expect(body.tracks.map((t: any) => t.id)).toEqual(["a"]);
    expect((await handler({ params: { did: "unknown" } })).body.tracks).toEqual(
      [],
    );
    expect(
      (
        await handler({
          params: { did: "listener.test", startDate: "2025-01-01T00:00:00Z" },
        })
      ).body.tracks,
    ).toEqual([]);
  });
});
