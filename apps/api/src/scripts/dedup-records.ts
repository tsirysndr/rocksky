/**
 * Remove duplicate `app.rocksky.artist` / `app.rocksky.album` /
 * `app.rocksky.song` records from a user's repo.
 *
 * Until 0c969e26, `scrobbleTrack` could publish one more artist (and, with a
 * stale global row or concurrent reports of a play, album and song) record on
 * every scrobble. This repairs the repos it left behind.
 *
 * Records are grouped by the identity ingest hashes (lowercased `name` /
 * `title - artist` / `title - artist - album`). In each group the record
 * Postgres already links the user to (`user_artists.uri` …) is kept, otherwise
 * the oldest one; the rest are deleted from the PDS and every DB column that
 * pointed at a deleted uri is repointed to the keeper.
 *
 * Usage (also wired as `bun dedup:records`):
 *   tsx ./src/scripts/dedup-records.ts <handle|did> [--dry-run] [--only artist,album,song]
 */

import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { type Column, eq, inArray, sql, type Table } from "drizzle-orm";
import { createAgent } from "lib/agent";
import tables from "schema";

type Collection = "artist" | "album" | "song";

type RepoRecord = {
  uri: string;
  rkey: string;
  createdAt: string;
  key: string;
};

const NSID: Record<Collection, string> = {
  artist: "app.rocksky.artist",
  album: "app.rocksky.album",
  song: "app.rocksky.song",
};

// Lowercased whole-string, exactly like `sha256::digest(... .to_lowercase())`
// in jetstream; the hash itself is unnecessary to group locally.
function identityKey(collection: Collection, value: Record<string, unknown>) {
  const s = (k: string) => (typeof value[k] === "string" ? value[k] : "");
  switch (collection) {
    case "artist":
      return s("name") ? s("name").toLowerCase() : null;
    case "album":
      return s("title") && s("artist")
        ? `${s("title")} - ${s("artist")}`.toLowerCase()
        : null;
    case "song":
      return s("title") && s("artist") && s("album")
        ? `${s("title")} - ${s("artist")} - ${s("album")}`.toLowerCase()
        : null;
  }
}

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const onlyIdx = argv.indexOf("--only");
const onlyValue = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;
const COLLECTIONS = (onlyValue?.split(",") ?? [
  "artist",
  "album",
  "song",
]) as Collection[];
const target = argv.find((a) => !a.startsWith("--") && a !== onlyValue);

if (!target || COLLECTIONS.some((c) => !(c in NSID))) {
  consola.error(
    `Usage: ${chalk.cyan("bun dedup:records -- <handle|did> [--dry-run] [--only artist,album,song]")}`,
  );
  process.exit(1);
}

let did = target;
if (!did.startsWith("did:")) {
  did = await ctx.baseIdResolver.handle.resolve(did);
}

const agent = await createAgent(ctx.oauthClient, did);
if (!agent) {
  consola.error(`No PDS session for ${did} — the user has to log in again.`);
  process.exit(1);
}
const repo = agent.assertDid;

async function listAll(collection: Collection): Promise<RepoRecord[]> {
  const out: RepoRecord[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo,
      collection: NSID[collection],
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      const value = r.value as Record<string, unknown>;
      const key = identityKey(collection, value);
      if (!key) continue;
      out.push({
        uri: r.uri,
        rkey: r.uri.split("/").pop() ?? "",
        createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
        key,
      });
    }
    cursor = res.data.cursor;
  } while (cursor);
  return out;
}

// The uris Postgres links this user to: profile pages resolve those, so they
// win the choice of which copy survives.
async function linkedUris(collection: Collection): Promise<Set<string>> {
  const table = {
    artist: tables.userArtists,
    album: tables.userAlbums,
    song: tables.userTracks,
  }[collection];
  const rows = await ctx.db
    .select({ uri: table.uri })
    .from(table)
    .innerJoin(tables.users, eq(table.userId, tables.users.id))
    .where(eq(tables.users.did, did))
    .execute();
  return new Set(rows.map((r) => r.uri));
}

function pickKeeper(group: RepoRecord[], linked: Set<string>): RepoRecord {
  const sorted = [...group].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.rkey.localeCompare(b.rkey),
  );
  return sorted.find((r) => linked.has(r.uri)) ?? sorted[0];
}

async function deleteRecords(collection: Collection, rkeys: string[]) {
  const BATCH = 100;
  for (let i = 0; i < rkeys.length; i += BATCH) {
    const batch = rkeys.slice(i, i + BATCH);
    await agent.com.atproto.repo.applyWrites({
      repo,
      writes: batch.map((rkey) => ({
        $type: "com.atproto.repo.applyWrites#delete" as const,
        collection: NSID[collection],
        rkey,
      })),
    });
    consola.info(
      `  deleted ${Math.min(i + BATCH, rkeys.length)}/${rkeys.length} ${NSID[collection]}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const REFERENCES: Record<Collection, [Table, Column][]> = {
  artist: [
    [tables.userArtists, tables.userArtists.uri],
    [tables.artists, tables.artists.uri],
    [tables.tracks, tables.tracks.artistUri],
    [tables.albums, tables.albums.artistUri],
  ],
  album: [
    [tables.userAlbums, tables.userAlbums.uri],
    [tables.albums, tables.albums.uri],
    [tables.tracks, tables.tracks.albumUri],
  ],
  song: [
    [tables.userTracks, tables.userTracks.uri],
    [tables.tracks, tables.tracks.uri],
  ],
};

async function repoint(collection: Collection, keeper: string, gone: string[]) {
  for (const [table, column] of REFERENCES[collection]) {
    try {
      const res = await ctx.db.execute(
        sql`UPDATE ${table} SET ${sql.identifier(column.name)} = ${keeper} WHERE ${inArray(column, gone)}`,
      );
      const n = res.rowCount ?? 0;
      if (n > 0) consola.info(`  ${column.name}: ${n} row(s) → ${keeper}`);
    } catch (e) {
      consola.warn(
        `  could not repoint ${column.name} to ${keeper}: ${(e as Error).message}`,
      );
    }
  }
}

for (const collection of COLLECTIONS) {
  consola.info(chalk.bold(`\n${NSID[collection]}`));
  const [records, linked] = await Promise.all([
    listAll(collection),
    linkedUris(collection),
  ]);

  const groups = new Map<string, RepoRecord[]>();
  for (const r of records) {
    const g = groups.get(r.key);
    if (g) g.push(r);
    else groups.set(r.key, [r]);
  }
  const duplicated = [...groups.values()].filter((g) => g.length > 1);
  const surplus = duplicated.reduce((n, g) => n + g.length - 1, 0);
  consola.info(
    `${records.length} records, ${groups.size} distinct, ${duplicated.length} duplicated (${surplus} to delete)`,
  );
  if (surplus === 0) continue;

  const plan = duplicated.map((group) => {
    const keeper = pickKeeper(group, linked);
    return { keeper, gone: group.filter((r) => r !== keeper) };
  });

  for (const { keeper, gone } of plan) {
    consola.info(
      `${chalk.green("keep")} ${keeper.uri}  ${chalk.red(`-${gone.length}`)}  ${chalk.dim(keeper.key)}`,
    );
  }
  if (DRY_RUN) continue;

  await deleteRecords(
    collection,
    plan.flatMap(({ gone }) => gone.map((r) => r.rkey)),
  );
  for (const { keeper, gone } of plan) {
    await repoint(
      collection,
      keeper.uri,
      gone.map((r) => r.uri),
    );
  }
}

consola.info(
  chalk.greenBright(
    DRY_RUN ? "\nDry run complete." : "\nDeduplication complete.",
  ),
);
process.exit(0);
