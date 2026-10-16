import { beforeAll, afterAll, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import { sql } from "drizzle-orm";
import { filteredPage } from "./filteredPage";
import tables from "schema";
import type { Context } from "context";

const url = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
describe.skipIf(!url)("RSQL catalog query regressions (PostgreSQL)", () => {
  const client = new pg.Client({ connectionString: url });
  const queries: string[] = [];
  const db = drizzle(client, {
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  });
  let songs: typeof import("../xrpc/app/rocksky/song/getSongs").retrieveSongs;
  let albums: typeof import("../xrpc/app/rocksky/album/getAlbums").retrieveAlbums;
  let artists: typeof import("../xrpc/app/rocksky/artist/getArtists").retrieveArtists;
  let playlists: typeof import("../xrpc/app/rocksky/playlist/getPlaylists").retrievePlaylists;
  let actorPlaylists: typeof import("../xrpc/app/rocksky/actor/getActorPlaylists").retrieveActorPlaylists;
  let scrobbles: typeof import("../xrpc/app/rocksky/scrobble/getScrobbles").fetchScrobbles;
  beforeAll(async () => {
    // Endpoint modules allocate pools; keep these test-local and never use .env credentials.
    process.env.XATA_POSTGRES_URL = url!;
    process.env.XATA_WRITE_POSTGRES_URL = url!;
    process.env.XATA_READ_POSTGRES_URL = url!;
    for (const key of [
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "SPOTIFY_ENCRYPTION_KEY",
      "SPOTIFY_ENCRYPTION_IV",
      "ROCKSKY_BETA_TOKEN",
      "DROPBOX_CLIENT_ID",
      "DROPBOX_CLIENT_SECRET",
      "DROPBOX_REDIRECT_URI",
      "GOOGLE_REDIRECT_URI",
      "PRIVATE_KEY_1",
      "PRIVATE_KEY_2",
      "PRIVATE_KEY_3",
      "S3_ENDPOINT",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "TYPESENSE_API_KEY",
    ])
      process.env[key] ??= "test-placeholder";
    songs = (await import("../xrpc/app/rocksky/song/getSongs")).retrieveSongs;
    albums = (await import("../xrpc/app/rocksky/album/getAlbums"))
      .retrieveAlbums;
    artists = (await import("../xrpc/app/rocksky/artist/getArtists"))
      .retrieveArtists;
    playlists = (await import("../xrpc/app/rocksky/playlist/getPlaylists"))
      .retrievePlaylists;
    actorPlaylists = (
      await import("../xrpc/app/rocksky/actor/getActorPlaylists")
    ).retrieveActorPlaylists;
    scrobbles = (await import("../xrpc/app/rocksky/scrobble/getScrobbles"))
      .fetchScrobbles;
    await client.connect();
    for (const table of [
      tables.tracks,
      tables.artists,
      tables.albums,
      tables.scrobbles,
      tables.users,
      tables.playlists,
      tables.playlistTracks,
      tables.userPlaylists,
    ]) {
      const { name, columns } = getTableConfig(table);
      await client.query(
        `CREATE TEMP TABLE "${name}" (${columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.name.startsWith("xata_") && c.getSQLType().startsWith("timestamp") ? " DEFAULT '2024-01-01'" : ""}`).join(",")})`,
      );
    }
    await client.query(`
      INSERT INTO artists (xata_id,name,genres) VALUES ('a','Metallica',ARRAY['metal']),('a2','Metallica',ARRAY['metal']),('b','Other',ARRAY['pop']);
      INSERT INTO albums (xata_id,title,artist,year,sha256) VALUES ('al','Love Album','Metallica',1991,'al'),('al2','Other','Other',2024,'al2');
      INSERT INTO users (xata_id,did,handle) VALUES ('u','did:test:u','user.test'),('v','did:test:v','v.test');
      INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,track_number,disc_number,sha256,album_art) VALUES
        ('t1','Love Song','Metallica','Metallica','Love Album',400000,1,1,'t1','cover1'),
        ('t2','Other Song','Metallica','Metallica','Other',100000,2,2,'t2','cover2'),
        ('t3','100%_love','Other','Other','Other',200000,1,1,'t3','cover3');
      INSERT INTO scrobbles (xata_id,track_id,album_id,artist_id,user_id,timestamp) VALUES
        ('s1','t1','al','a','u','2024-01-01'),('s2','t1','al','a','u','2024-01-02'),('s3','t1','al','a','v','2024-01-03'),
        ('s4','t2','al2','a','u','2024-01-04'),('s5','t3','al2','b','v','2024-01-05');
      INSERT INTO playlists (xata_id,name,created_by) VALUES ('p','Rock','u');
      INSERT INTO user_playlists (xata_id,user_id,playlist_id) VALUES ('up','u','p');
      INSERT INTO playlist_tracks (xata_id,playlist_id,track_id) VALUES ('pt1','p','t1'),('pt2','p','t2');
    `);
  });
  afterAll(async () => {
    await client.end();
  });
  it("preserves exact filters, page order, genre membership and counts without artist fan-out", async () => {
    const result = await songs(db, {
      filter: 'artist=="Metallica"',
      limit: 50,
      offset: 0,
    });
    expect(result.data.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(result.data[0].play_count).toBe(3);
    expect(result.data[0].unique_listeners).toBe(2);
    expect((await songs(db, { filter: "artist==metallica" })).data).toEqual([]);
    expect(
      (await songs(db, { filter: 'artist=="Metallica"', genre: "metal" }))
        .data[0].play_count,
    ).toBe(3);
    expect(
      (await songs(db, { filter: 'artist=="Metallica"', limit: 1, offset: 1 }))
        .data[0].id,
    ).toBe("t2");
    expect(
      queries.some((q) => q.includes('count("scrobbles"."xata_id")')),
    ).toBe(false);
  });
  it("handles wildcard case, escaped percent/underscore, numeric predicates, AND/OR and nulls", async () => {
    for (const [filter, ids] of [
      ['title=="*LOVE*"', ["t1", "t3"]],
      ['title=="*100%_*"', ["t3"]],
      ['artist=="Metallica";duration=gt=300000', ["t1"]],
      ['(artist=="Metallica",artist==Other);discNumber==2', ["t2"]],
      ['title!=null;title!="*Song*"', ["t3"]],
      ['album=="*love*"', ["t1"]],
    ] as const) {
      expect(
        (await songs(db, { filter })).data.map((r) => r.id).sort(),
      ).toEqual([...ids].sort());
    }
  });
  it("keeps album and artist aggregates correct under RSQL filters", async () => {
    const result = await albums(db, {
      filter: 'artist=="Metallica";year=ge=1990',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].play_count).toBe(3);
    expect(result.data[0].unique_listeners).toBe(2);
    expect((await albums(db, { filter: 'title=="*LOVE*"' })).data[0].id).toBe(
      "al",
    );
    const rows = (
      await artists(db, { filter: 'name=="*METALLICA*";genres==metal' })
    ).data;
    expect(rows.find((r) => r.id === "a")?.play_count).toBe(4);
    expect(rows.find((r) => r.id === "a")?.unique_listeners).toBe(2);
  });
  it("playlist predicates match the same track and do not multiply results", async () => {
    for (const filter of [
      'track.artist=="Metallica"',
      'track.title=="*song*"',
    ]) {
      expect(await playlists(db, { filter })).toHaveLength(1);
      expect(
        await actorPlaylists(db, {
          did: "did:test:u",
          filter,
          limit: 50,
          offset: 0,
        }),
      ).toHaveLength(1);
    }
    expect(
      await playlists(db, {
        filter: 'track.title=="Love Song";track.album==Other',
      }),
    ).toHaveLength(0);
    expect(
      await playlists(db, { filter: 'name==Rock;track.album=="Love Album"' }),
    ).toHaveLength(1);
  });
  it("pages catalog matches before counts and includes matching unplayed items", async () => {
    await client.query(
      `INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,xata_createdat) VALUES ('unplayed','Unplayed Love','Metallica','Metallica','New',1000,'unplayed','2025-01-01')`,
    );
    const result = await songs(db, { filter: 'title=="*Love*"', limit: 1 });
    expect(result.data[0].id).toBe("unplayed");
    expect(result.data[0].play_count).toBe(0);
    expect(result.data[0].unique_listeners).toBe(0);
    expect(
      (await songs(db, { filter: 'title=="*Love*"', limit: 1, offset: 1 }))
        .data[0].id,
    ).toBe("t1");
    await client.query(`DELETE FROM tracks WHERE xata_id='unplayed'`);
  });

  it("uses bounded filter-first pages for rare values and recent pages for broad matches", async () => {
    await client.query(
      `CREATE TEMP TABLE filtered_page_fixture (id text, created_at timestamp, tag text)`,
    );
    await client.query(
      `INSERT INTO filtered_page_fixture SELECT lpad(n::text,5,'0'), timestamp '2024-01-01' + n * interval '1 second', CASE WHEN n<=2 THEN 'rare' ELSE 'common' END FROM generate_series(1,12000) n`,
    );
    await client.query(`ANALYZE filtered_page_fixture`);
    let start = queries.length;
    expect(
      await filteredPage(
        db,
        sql`SELECT id,created_at FROM filtered_page_fixture WHERE tag=${"rare"}`,
        1,
        1,
      ),
    ).toEqual(["00001"]);
    expect(
      queries.slice(start).some((q) => q.includes("AS MATERIALIZED")),
    ).toBe(true);
    start = queries.length;
    expect(
      await filteredPage(
        db,
        sql`SELECT id,created_at FROM filtered_page_fixture`,
        2,
        0,
      ),
    ).toEqual(["12000", "11999"]);
    expect(
      queries.slice(start).some((q) => q.includes("AS MATERIALIZED")),
    ).toBe(false);
  });

  it("scrobble RSQL filters preserve joins, timestamps and pagination", async () => {
    const ctx = { db } as unknown as Context;
    const rows = await scrobbles(
      ctx,
      { filter: 'track.title=="*love*";date=ge=2024-01-02', limit: 50 },
      null,
    );
    expect(rows.map((r) => r.scrobbles.id)).toEqual(["s5", "s3", "s2"]);
    expect(
      (
        await scrobbles(
          ctx,
          { filter: "user.handle==user.test", limit: 1, offset: 1 },
          null,
        )
      )[0].scrobbles.id,
    ).toBe("s2");
  });
});
