import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Effect } from "effect";
import pg from "pg";
import tables from "schema";

let db: NodePgDatabase;
// Exercise the real endpoint and SQL against session-local tables, without
// importing the production pools or connecting to any external services.
mock.module("lib/dbQuery", () => ({
  dbQuery: (_label: string, run: (db: NodePgDatabase) => Promise<unknown>) =>
    Effect.tryPromise(() => run(db)),
}));
const { default: register } = await import(
  "../src/xrpc/app/rocksky/actor/getActorScrobbles"
);
const databaseUrl = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("profile recent scrobbles (PostgreSQL)", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  let handler: (request: any) => Promise<any>;
  const statements: { sql: string; params: unknown[] }[] = [];
  beforeAll(async () => {
    await client.connect();
    for (const table of [
      tables.users,
      tables.tracks,
      tables.scrobbles,
      tables.lovedTracks,
    ]) {
      const { name, columns } = getTableConfig(table);
      await client.query(
        `CREATE TEMP TABLE "${name}" (${columns.map((c) => `"${c.name}" ${c.getSQLType()}`).join(",")})`,
      );
    }
    await client.query(`
      INSERT INTO users (xata_id,did,handle,avatar) VALUES ('u','did:test:u','listener.test','avatar'),('v','did:test:v','other.test','');
      INSERT INTO tracks (xata_id,title,artist,album,sha256) VALUES ('t','Song','Artist','Album','hash');
      INSERT INTO scrobbles (xata_id,user_id,track_id,timestamp,uri) VALUES
        ('a','u','t','2026-10-07 10:00:00','at://a'),
        ('b','u','t','2026-10-07 10:00:00','at://b'),
        ('c','u','t','2026-10-07 11:00:00','at://c'),
        ('d','v','t','2026-10-07 12:00:00','at://d'),
        ('e','u',NULL,'2026-10-07 13:00:00','at://e');
      INSERT INTO loved_tracks (user_id,track_id) VALUES ('v','t');
    `);
    db = drizzle(client, {
      logger: {
        logQuery(sql, params) {
          statements.push({ sql, params });
        },
      },
    });
    register(
      {
        app: {
          rocksky: {
            actor: {
              getActorScrobbles(config: any) {
                handler = config.handler;
              },
            },
          },
        },
      } as any,
      { db, authVerifier: () => ({}) } as any,
    );
  });
  afterAll(async () => {
    await client.end();
  });
  const request = (did: string, offset = 0, limit = 2) =>
    handler({
      params: { did, offset, limit },
      auth: { credentials: { did: "did:test:v" } },
    });

  it("returns the same recent records by DID and handle with likes preserved", async () => {
    const byDid = await request("did:test:u");
    const byHandle = await request("listener.test");
    expect(byHandle.body).toEqual(byDid.body);
    expect(byDid.body.scrobbles.map((s: any) => s.id)).toEqual(["c", "b"]);
    expect(byDid.body.scrobbles[0]).toMatchObject({
      title: "Song",
      artist: "Artist",
      handle: "listener.test",
      liked: true,
      createdAt: "2026-10-07T11:00:00.000Z",
    });
  });
  it("paginates equal timestamps without overlaps or other users' records", async () => {
    expect(
      (await request("listener.test", 2)).body.scrobbles.map((s: any) => s.id),
    ).toEqual(["a"]);
  });
  it("returns an empty list for an unknown actor", async () => {
    expect((await request("missing.test")).body).toEqual({ scrobbles: [] });
  });
  it("binds user_id directly so the ordered per-user index is usable", async () => {
    statements.length = 0;
    await request("listener.test");
    const query = statements.find((s) => s.sql.includes('from "scrobbles"'))!;
    expect(query.sql).toContain('where "scrobbles"."user_id" = $1');
    expect(query.params[0]).toBe("u");
    expect(query.sql).not.toContain('"users"."handle" =');
  });
});
