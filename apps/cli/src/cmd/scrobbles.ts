import chalk from "chalk";
import { RockskyClient } from "client";
import dayjs from "dayjs";
import relative from "dayjs/plugin/relativeTime.js";
import { c } from "theme";

dayjs.extend(relative);

export async function scrobbles(did, { skip, limit }) {
  const client = new RockskyClient();
  const scrobbles = await client.scrobbles(did, { skip, limit });

  for (const scrobble of scrobbles) {
    if (did) {
      console.log(
        `${chalk.bold(c.accent(scrobble.title))} ${
          scrobble.artist
        } ${c.link(dayjs(scrobble.created_at + "Z").fromNow())}`
      );
      continue;
    }
    const handle = `@${scrobble.user}`;
    console.log(
      `${chalk.italic(c.secondary(handle))} is listening to ${chalk.bold(
        c.accent(scrobble.title)
      )} ${scrobble.artist} ${c.link(dayjs(scrobble.date).fromNow())}`
    );
  }
}
