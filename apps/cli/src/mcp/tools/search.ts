import { RockskyClient } from "client";

export async function search(
  query: string,
  { limit = 20, albums = false, artists = false, tracks = false, users = false }
): Promise<string> {
  const client = new RockskyClient();
  const results = await client.search(query, { size: limit });
  if (results.records.length === 0) {
    return `No results found for ${query}.`;
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

  const responses = [];
  for (const { table, record } of mergedResults) {
    if (table === "users") {
      responses.push({
        handle: record.handle,
        display_name: record.display_name,
        did: record.did,
        link: `https://rocksky.app/profile/${record.did}`,
        type: "account",
      });
    }

    if (table === "albums") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]}`
        : "";
      responses.push({
        title: record.title,
        artist: record.artist,
        link: link,
        type: "album",
      });
    }

    if (table === "tracks") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]}`
        : "";
      responses.push({
        title: record.title,
        artist: record.artist,
        link: link,
        type: "track",
      });
    }

    if (table === "artists") {
      const link = record.uri
        ? `https://rocksky.app/${record.uri?.split("at://")[1]}`
        : "";
      responses.push({
        name: record.name,
        link: link,
        type: "artist",
      });
    }
  }

  return JSON.stringify(responses, null, 2);
}
