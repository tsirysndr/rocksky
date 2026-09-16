import { RockskyClient } from "client";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { getBorderCharacters, table } from "table";
import { c } from "theme";

export async function stats(did?: string) {
  const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
  try {
    await fs.access(tokenPath);
  } catch (err) {
    if (!did) {
      console.error(
        `You are not logged in. Please run ${c.primary(
          "`rocksky login <username>.bsky.social`"
        )} first.`
      );
      return;
    }
  }

  const tokenData = await fs.readFile(tokenPath, "utf-8");
  const { token } = JSON.parse(tokenData);
  if (!token && !did) {
    console.error(
      `You are not logged in. Please run ${c.primary(
        "`rocksky login <username>.bsky.social`"
      )} first.`
    );
    return;
  }

  const client = new RockskyClient(token);
  const stats = await client.stats(did);

  console.log(
    table(
      [
        ["Scrobbles", c.accent(stats.scrobbles)],
        ["Tracks", c.accent(stats.tracks)],
        ["Albums", c.accent(stats.albums)],
        ["Artists", c.accent(stats.artists)],
        ["Loved Tracks", c.accent(stats.lovedTracks)],
      ],
      {
        border: getBorderCharacters("void"),
        columnDefault: {
          paddingLeft: 0,
          paddingRight: 1,
        },
        drawHorizontalLine: () => false,
      }
    )
  );
}
