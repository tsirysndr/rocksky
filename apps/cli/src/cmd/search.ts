import chalk from "chalk";
import { RockskyClient } from "client";

export async function search(
  query: string,
  { limit = 20, albums = false, artists = false, tracks = false, users = false }
) {
  const client = new RockskyClient();
  const results = await client.search(query, { size: limit });
  if (results.records.length === 0) {
    console.log(`No results found for ${chalk.magenta(query)}.`);
    return;
  }

  // merge all results into one array with type and sort by xata_scrore
  let mergedResults = results.records.map((record) => ({
    ...record,
    type: record.table,
  }));

  if (albums) {
    mergedResults = mergedResults.filter((record) => record.table === "albums");
  }

  if (artists) {
    mergedResults = mergedResults.filter(
      (record) => record.table === "artists"
    );
  }

  if (tracks) {
    mergedResults = mergedResults.filter(({ table }) => table === "tracks");
  }

  if (users) {
    mergedResults = mergedResults.filter(({ table }) => table === "users");
  }

  mergedResults.sort((a, b) => b.xata_score - a.xata_score);

  for (const { table, record } of mergedResults) {
    if (table === "users") {
      console.log(
        `${chalk.bold.magenta(record.handle)} ${
          record.display_name
        } ${chalk.yellow(`https://rocksky.app/profile/${record.did}`)}`
      );
    }

    if (table === "albums") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]}`
        : "";
      console.log(
        `${chalk.bold.magenta(record.title)} ${record.artist} ${chalk.yellow(
          link
        )}`
      );
    }

    if (table === "tracks") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]}`
        : "";
      console.log(
        `${chalk.bold.magenta(record.title)} ${record.artist} ${chalk.yellow(
          link
        )}`
      );
    }
  }
}
