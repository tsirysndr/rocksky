import chalk from "chalk";
import { ctx } from "context";
import { count } from "drizzle-orm";
import tables from "schema";

async function main() {
  console.log(chalk.cyan("Starting Meilisearch sync..."));

  try {
    await Promise.all([
      createAlbums(),
      createArtists(),
      createTracks(),
      createUsers(),
    ]);
    console.log(chalk.green("Meilisearch sync completed successfully."));
  } catch (error) {
    console.error(chalk.red("Error during Meilisearch sync:"), error);
  }
}

await main();

async function createAlbums() {
  const { meilisearch } = ctx;
  let skip = 0;
  let size = 100;
  const total = await ctx.db
    .select({ value: count() })
    .from(tables.albums)
    .execute()
    .then(([row]) => row.value);
  const results = await ctx.db
    .select()
    .from(tables.albums)
    .limit(size)
    .offset(skip)
    .execute();

  await meilisearch.post(`indexes/albums/documents?primaryKey=id`, results);
}

async function createArtists() {
  const { meilisearch } = ctx;
  let size = 100;
  const total = await ctx.db
    .select({ value: count() })
    .from(tables.artists)
    .execute()
    .then(([row]) => row.value);
  for (let i = 0; i < total; i += size) {
    const skip = i;
    console.log(
      `Processing ${chalk.magentaBright("artists")}: ${chalk.magentaBright(skip)} to ${chalk.magentaBright(skip + size)}`
    );
    const results = await ctx.db
      .select()
      .from(tables.artists)
      .limit(size)
      .offset(skip)
      .execute();

    await meilisearch.post(`indexes/artists/documents?primaryKey=id`, results);
  }
}

async function createTracks() {
  const { meilisearch } = ctx;
  let size = 100;
  const total = await ctx.db
    .select({ value: count() })
    .from(tables.tracks)
    .execute()
    .then(([row]) => row.value);
  for (let i = 0; i < total; i += size) {
    const skip = i;
    console.log(
      `Processing ${chalk.magentaBright("tracks")}: ${chalk.magentaBright(skip)} to ${chalk.magentaBright(skip + size)}`
    );
    const results = await ctx.db
      .select()
      .from(tables.tracks)
      .limit(size)
      .offset(skip)
      .execute();

    await meilisearch.post(`/indexes/tracks/documents?primaryKey=id`, results);
  }
}

async function createUsers() {
  const { meilisearch } = ctx;
  let size = 100;
  const total = await ctx.db
    .select({ value: count() })
    .from(tables.users)
    .execute()
    .then(([row]) => row.value);

  for (let i = 0; i < total; i += size) {
    const skip = i;
    console.log(
      `Processing ${chalk.magentaBright("users")}: ${chalk.magentaBright(skip)} to ${chalk.magentaBright(skip + size)}`
    );
    const results = await ctx.db
      .select()
      .from(tables.users)
      .limit(size)
      .offset(skip)
      .execute();

    await meilisearch.post(`/indexes/users/documents?primaryKey=id`, results);
  }
}

process.exit(0);
