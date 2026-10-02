import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import pg from "pg";
import { neighboursQuery } from "./neighboursQuery";

const databaseUrl = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("neighbours SQL (PostgreSQL)", () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const load = async (id: string) => {
    const query = new PgDialect().sqlToQuery(neighboursQuery(id));
    return (await client.query(query.sql, query.params)).rows;
  };
  beforeAll(async () => {
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE user_artists_mv (user_id text, artist_id text, play_count int, PRIMARY KEY (user_id, artist_id));
      CREATE TEMP TABLE users (xata_id text PRIMARY KEY, did text, handle text, display_name text, avatar text);
      CREATE TEMP TABLE artists (xata_id text PRIMARY KEY, name text, picture text, uri text);
      INSERT INTO users (xata_id,did,handle) VALUES ('target','did:target','target.test'),('n1','did:n1','one.test'),('n2','did:n2','two.test'),('unrelated','did:other','other.test');
      INSERT INTO artists SELECT 'a'||n, 'Artist '||n, NULL, 'at://artist/'||n FROM generate_series(1,8) n;
      INSERT INTO user_artists_mv SELECT 'target','a'||n,1 FROM generate_series(1,7) n;
      INSERT INTO user_artists_mv SELECT 'n1','a'||n,n FROM generate_series(1,6) n;
      INSERT INTO user_artists_mv VALUES ('n1','a8',999),('n2','a1',10),('n2','a2',10),('unrelated','a8',1000);
    `);
  });
  afterAll(async () => {
    await client.end();
  });

  it("ranks by shared artists and selects five shared artists by the neighbour's plays", async () => {
    const rows = await load("target");
    expect(
      rows.map((r) => [r.user_id, r.shared_count, r.target_artist_count]),
    ).toEqual([
      ["n1", 6, 7],
      ["n2", 2, 7],
    ]);
    expect(rows[0].top_artists.map((a: any) => a.id)).toEqual([
      "a6",
      "a5",
      "a4",
      "a3",
      "a2",
    ]);
    expect(rows[1].top_artists.map((a: any) => a.id)).toEqual(["a1", "a2"]);
    expect(rows[0].top_artists[0]).toEqual({
      id: "a6",
      name: "Artist 6",
      picture: null,
      uri: "at://artist/6",
    });
  });

  it("caps results at 50 with deterministic ordering for tied neighbours", async () => {
    await client.query(`
      INSERT INTO users (xata_id,did,handle) SELECT 'z'||lpad(n::text,2,'0'),'did:z'||n,'z'||n||'.test' FROM generate_series(1,55) n;
      INSERT INTO user_artists_mv SELECT 'z'||lpad(n::text,2,'0'),'a1',1 FROM generate_series(1,55) n;
    `);
    const rows = await load("target");
    expect(rows).toHaveLength(50);
    expect(rows[0].user_id).toBe("n1");
    expect(rows[49].user_id).toBe("z48");
    expect(rows[49].shared_count).toBe(1);
  });

  it("returns no neighbours for an actor without any artist pairs", async () => {
    expect(await load("missing")).toEqual([]);
  });
});
