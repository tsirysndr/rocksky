import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import tables from "schema";

process.env.NODE_ENV = "test";
const envSource = readFileSync(
  new URL("../src/lib/env.ts", import.meta.url),
  "utf8",
);
for (const [, key] of envSource.matchAll(/([A-Z0-9_]+): str\((?:\{\})?\)/g))
  process.env[key] ??= "query-test";
const url = process.env.ROCKSKY_QUERY_TEST_DATABASE_URL;
const endpoints = [
  ["feed", "getStories", "Feed.GetStories"],
  ["actor", "getActorArtists", "Actor.GetActorArtists"],
  ["stats", "getStats", "Stats.GetStats"],
  ["graph", "getFollowers", "Graph.GetFollowers"],
  ["graph", "getFollows", "Graph.GetFollows"],
  ["actor", "getProfile", "Actor.GetProfile"],
];
for (const language of [
  "typescript",
  ...(process.env.ROCKSKY_TEST_PURESCRIPT ? ["purescript"] : []),
]) {
  test.skipIf(!url)(
    `${language}: optimized profile queries preserve stories, dates, stats and graph pages`,
    async () => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      const originalFetch = globalThis.fetch;
      let releaseRefresh: () => void = () => {};
      try {
        for (const table of [
          tables.users,
          tables.artists,
          tables.albums,
          tables.tracks,
          tables.scrobbles,
          tables.follows,
          tables.lovedTracks,
          tables.feeds,
          tables.spotifyAccounts,
          tables.spotifyTokens,
        ]) {
          const { name, columns } = getTableConfig(table);
          await client.query(
            `CREATE TEMP TABLE "${name}" (${columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.name === "xata_createdat" || c.name === "xata_updatedat" ? " DEFAULT now()" : ""}`).join(",")})`,
          );
        }
        await client.query(`
    INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:u','u.test','User','avatar'),('v','did:plc:v','v.test','Viewer',''),('idle','did:plc:idle','idle.test','Idle','');
    INSERT INTO artists(xata_id,name,sha256,uri) VALUES ('ar','Artist','ar','at://artist'),('va','Various Artists','va','at://various');
    INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist','al','at://album');
    INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,uri) VALUES ('t','Song','Artist','Album','Artist','t','at://track');
    INSERT INTO scrobbles(xata_id,user_id,artist_id,album_id,track_id,timestamp,uri) VALUES
     ('s1','u','ar','al','t','2024-01-01','at://s1'),('s2','u','ar','al','t','2024-01-01','at://s2'),
     ('s3','v','ar','al','t','2024-01-02','at://s3'),('s4','u','va','al','t','2023-01-01','at://s4');
    INSERT INTO follows(uri,follower_did,subject_did,xata_createdat) VALUES ('at://v/u','did:plc:v','did:plc:u','2024-01-02'),('at://idle/u','did:plc:idle','did:plc:u','2024-01-01'),('at://v/idle','did:plc:v','did:plc:idle','2024-01-03');
    INSERT INTO loved_tracks(user_id,track_id) VALUES ('v','t');
    INSERT INTO spotify_accounts(user_id,email,is_beta_user) VALUES ('u','private@test',true);
    INSERT INTO spotify_tokens(xata_id,user_id,access_token,refresh_token) VALUES ('token','u','secret-access','secret-refresh');
   `);
        const statements: string[] = [];
        const db = drizzle(client, {
          logger: {
            logQuery(sql) {
              statements.push(sql);
            },
          },
        });
        const cache = new Map();
        let resolves = 0;
        const stalled = new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        });
        const resolver = {
          handle: {
            resolve: async () => {
              resolves++;
              await stalled;
              return "did:plc:u";
            },
          },
          did: {
            resolveAtprotoData: async () => {
              resolves++;
              await stalled;
              return {
                did: "did:plc:u",
                handle: "u.test",
                pds: "https://pds.test",
                signingKey: "test",
              };
            },
          },
        };
        const ctx: any = {
          db,
          readDb: db,
          redis: {
            get: async (k: string) => cache.get(k) ?? null,
            setEx: async (k: string, _ttl: number, v: string) =>
              cache.set(k, v),
          },
          authVerifier: async () => ({}),
          baseIdResolver: resolver,
          resolver: {
            resolveDidToHandle: async () => {
              resolves++;
              await stalled;
              return "u.test";
            },
          },
          nc: { publish() {} },
        };
        if (language === "purescript") {
          const { toAffE } = await import(
            "../../../purescript/output/Control.Promise/index.js"
          );
          const resolve = ctx.resolver.resolveDidToHandle;
          ctx.resolver.resolveDidToHandle = (did: string) =>
            toAffE(() => resolve(did));
        }
        globalThis.fetch = async () => {
          await stalled;
          return new Response(
            JSON.stringify({
              did: "did:plc:u",
              handle: "u.test",
              displayName: "User",
              avatar: "https://avatar.test/u",
            }),
            { headers: { "content-type": "application/json" } },
          );
        };
        const handlers = new Map<string, any>();
        for (const [group, name, ps] of endpoints) {
          if (language === "typescript") {
            const mod = await import(
              `../src/xrpc/app/rocksky/${group}/${name}.ts`
            );
            mod.default(
              {
                app: {
                  rocksky: {
                    [group]: {
                      [name]: (config: any) =>
                        handlers.set(name, config.handler),
                    },
                  },
                },
              },
              ctx,
            );
          } else {
            const mod = await import(
              `../../../purescript/output/Rocksky.Xrpc.App.Rocksky.${ps}/index.js`
            );
            mod.register({
              method: (_name: string, config: any) =>
                handlers.set(name, config.handler),
            })(ctx)();
          }
        }
        const call = async (name: string, params: any, viewer?: string) =>
          (
            await handlers.get(name)({
              params,
              auth: viewer ? { credentials: { did: viewer } } : {},
            })
          ).body;
        statements.length = 0;

        const stories = await call(
          "getStories",
          { following: true, size: 80 },
          "did:plc:v",
        );
        expect(stories.stories.map((s: any) => s.uri)).toEqual(["at://s2"]);
        expect(stories.stories[0].liked).toBe(true);
        expect(
          statements.filter((s) => s.includes("FROM scrobbles inner_s")).length,
        ).toBe(1);
        expect(statements.join("\n")).not.toMatch(/DISTINCT ON|make_interval/);
        const reads = statements.length;
        await call("getStories", { following: true, size: 80 }, "did:plc:v");
        expect(statements.length).toBe(reads);
        statements.length = 0;
        const artists = await call("getActorArtists", {
          did: "u.test",
          limit: 100,
          offset: 0,
          startDate: "2024-01-01",
          endDate: "2024-01-02",
        });
        expect(
          artists.artists.map((a: any) => [
            a.id,
            a.playCount,
            a.uniqueListeners,
          ]),
        ).toEqual([["ar", 2, 2]]);
        expect(statements.length).toBe(1);
        expect(
          (await call("getActorArtists", { did: "missing" })).artists,
        ).toEqual([]);
        statements.length = 0;
        const stats = await Promise.all(
          Array.from({ length: 8 }, () => call("getStats", { did: "u.test" })),
        );
        expect(statements.length).toBe(2);
        expect(stats[0]).toEqual({
          scrobbles: 3,
          artists: 2,
          lovedTracks: 0,
          albums: 1,
          tracks: 1,
        });
        expect(
          stats.every((s) => JSON.stringify(s) === JSON.stringify(stats[0])),
        ).toBe(true);
        await client.query(
          "INSERT INTO loved_tracks(user_id,track_id) VALUES ('u','t')",
        );
        cache.delete("stats:v1:u.test");
        expect((await call("getStats", { did: "u.test" })).lovedTracks).toBe(1);
        expect((await call("getStats", { did: "missing" })).scrobbles).toBe(0);
        statements.length = 0;
        const first = await call("getFollowers", {
          actor: "did:plc:u",
          limit: 1,
        });
        expect(statements.length).toBe(1);
        expect(first.count).toBe(2);
        expect(first.followers[0].did).toBe("did:plc:v");
        const next = await call("getFollowers", {
          actor: "did:plc:u",
          limit: 1,
          cursor: first.cursor,
          dids: [],
        });
        expect(next.count).toBe(2);
        expect(next.followers[0].did).toBe("did:plc:idle");
        expect(next.cursor).toBe(String(Date.parse("2024-01-01Z")));
        const absent = await call("getFollowers", {
          actor: "did:plc:u",
          limit: 1,
          dids: ["did:missing"],
        });
        expect(absent.followers).toEqual([]);
        expect(absent.count).toBe(0);
        expect(absent.subject.did).toBe("did:plc:u");
        expect(absent.cursor).toBeUndefined();
        expect(
          (await call("getFollows", { actor: "did:plc:v", limit: 1 }))
            .follows[0].did,
        ).toBe("did:plc:idle");
        const saved = (await Promise.race([
          call("getProfile", { did: "u.test" }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Saved profile waited for network")),
              1000,
            ),
          ),
        ])) as any;
        expect(saved.did).toBe("did:plc:u");
        expect(saved.spotifyConnected).toBe(true);
        expect(saved.spotifyUser.email).toBeUndefined();
        expect(JSON.stringify(saved)).not.toContain("secret-");
        await call("getProfile", { did: "did:plc:u" });
        expect(resolves).toBe(1);
        releaseRefresh();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        releaseRefresh();
        globalThis.fetch = originalFetch;
        await client.end();
      }
    },
    10000,
  );
}
