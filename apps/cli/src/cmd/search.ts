import chalk from "chalk";
import { RockskyClient } from "client";
import _ from "lodash";

export async function search(
  query: string,
  {
    limit = 20,
    albums = false,
    artists = false,
    tracks = false,
    users = false,
  },
) {
  const client = new RockskyClient();
  const results = await client.search(query, { size: limit });
  if (results.hits.length === 0) {
    console.log(`No results found for ${chalk.magenta(query)}.`);
    return;
  }

  let mergedResults = results.hits.map((record) => ({
    ...record,
    type: _.get(record, "_federation.indexUid"),
  }));

  if (albums) {
    mergedResults = mergedResults.filter((record) => record.type === "albums");
  }

  if (artists) {
    mergedResults = mergedResults.filter((record) => record.type === "artists");
  }

  if (tracks) {
    mergedResults = mergedResults.filter(({ type }) => type === "tracks");
  }

  if (users) {
    mergedResults = mergedResults.filter(({ type }) => type === "users");
  }

  for (const { type, ...record } of mergedResults) {
    if (type === "users") {
      console.log(
        `${chalk.bold.magenta(record.handle)} ${
          record.displayName
        } ${chalk.yellow(`https://rocksky.app/profile/${record.did}`)}`,
      );
    }

    if (type === "albums") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`
        : "";
      console.log(
        `${chalk.bold.magenta(record.title)} ${record.artist} ${chalk.yellow(
          link,
        )}`,
      );
    }

    if (type === "tracks") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`
        : "";
      console.log(
        `${chalk.bold.magenta(record.title)} ${record.artist} ${chalk.yellow(
          link,
        )}`,
      );
    }
  }
}
