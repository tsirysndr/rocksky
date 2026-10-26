import { expect, it } from "bun:test";
import axios from "axios";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { env } from "lib/env";
import registerFeed from "./getFeed";
import registerStories from "./getStories";

const uri = "at://test/app.rocksky.feed.generator/afrobeat";
const dialect = new PgDialect();
function setup(responses: Record<string, any[][]>) {
  const statements: { table: string; sql: string }[] = [];
  const db = { select() {
    let table: string;
    const q = {
      from(t: any) { table = getTableName(t); return q; },
      leftJoin() { return q; }, innerJoin() { return q; },
      where(condition: any) { statements.push({table, sql: dialect.sqlToQuery(condition).sql}); return q; },
      orderBy() { return q; }, groupBy() { return q; }, limit() { return q; },
      async execute() {
        const rows = responses[table]?.shift();
        if (!rows) throw new Error(`Unexpected query: ${table}`);
        return rows;
      },
    };
    return q;
  }};
  const handlers: Record<string, any> = {};
  const server = { app: { rocksky: { feed: {
    getFeed(config: any) { handlers.feed = config.handler; },
    getStories(config: any) { handlers.stories = config.handler; },
  }}}};
  return {db, server, handlers, statements, done() {
    for (const rows of Object.values(responses)) expect(rows.length).toBe(0);
  }};
}

it("shares concurrent feeds, isolates viewers, and rechecks Redis versions", async () => {
  const own = {uri, did: env.ROCKSKY_FEEDGEN_DID};
  const m = setup({feeds: [[own], [own], [own]], scrobbles: [[], [], []]});
  let version = 0, calls = 0;
  const cache = new Map<string, string>();
  const previous = axios.defaults.adapter;
  axios.defaults.adapter = async config => {
    calls++;
    expect(config.url).toBe(`http://localhost:${env.ROCKSKY_FEEDGEN_PORT}/xrpc/app.rocksky.feed.getFeedSkeleton`);
    expect(config.params.limit).toBe(30);
    await new Promise(resolve => setTimeout(resolve, 10));
    return {data: {feed: [], cursor: "next"}, status: 200, statusText: "OK", headers: {}, config};
  };
  try {
    registerFeed(m.server as any, {db: m.db, redis: {
      async get(key: string) { return key.startsWith("feed:ver:") ? String(version) : cache.get(key); },
      async setEx(key: string, ttl: number, value: string) { expect(ttl).toBe(30); cache.set(key, value); },
    }} as any);
    const request = {params: {feed: uri, limit: 30}, auth: {}};
    const results = await Promise.all(Array.from({length: 8}, () => m.handlers.feed(request)));
    expect(calls).toBe(1);
    expect(results.every(r => r.body.cursor === "next")).toBe(true);
    version++;
    await m.handlers.feed(request);
    expect(calls).toBe(2);
    await m.handlers.feed({...request, auth: {credentials: {did: "did:viewer"}}});
    expect(calls).toBe(3);
    m.done();
  } finally { axios.defaults.adapter = previous; }
});

it("gets stories from the feeds service and queries bounded candidates once", async () => {
  const previous = axios.defaults.adapter;
  const requests: string[] = [];
  axios.defaults.adapter = async config => {
    requests.push(config.url!);
    return {data: {feed: [{scrobble: "at://old"}]}, status: 200, statusText: "OK", headers: {}, config};
  };
  try {
    for (const did of [env.ROCKSKY_FEEDGEN_DID, "did:web:external.test"]) {
      const m = setup({feeds: [[{uri, did}]], scrobbles: [[{trackId: null, uri: "at://old", timestamp: new Date("2020-01-01")}]]});
      registerStories(m.server as any, {db: m.db} as any);
      const result = await m.handlers.stories({params: {feed: uri, size: 80}, auth: {}});
      expect(result.body.stories[0].uri).toBe("at://old");
      const own = env.PUBLIC_URL.includes("localhost") || did === env.ROCKSKY_FEEDGEN_DID;
      expect(requests.at(-1)).toBe(`${own ? `http://localhost:${env.ROCKSKY_FEEDGEN_PORT}` : "https://external.test"}/xrpc/app.rocksky.feed.getFeedSkeleton`);
      const queries = m.statements.filter(s => s.table === "scrobbles");
      expect(queries.length).toBe(1);
      expect(queries[0].sql).not.toContain("make_interval");
      m.done();
    }
    const m = setup({scrobbles: [[], [], []]});
    registerStories(m.server as any, {db: m.db} as any);
    await m.handlers.stories({params: {size: 80}, auth: {}});
    const queries = m.statements.filter(s => s.table === "scrobbles");
    expect(queries.length).toBe(3);
    expect(queries[0].sql).toContain("make_interval");
    m.done();
  } finally { axios.defaults.adapter = previous; }
});
