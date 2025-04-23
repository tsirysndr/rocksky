import chalk from "chalk";
import { ctx } from "context";
import { publishScrobble } from "nowplaying/nowplaying.service";

const args = process.argv.slice(2);

for (const arg of args) {
  console.log(`Syncing scrobbles ${chalk.magenta(arg)} ...`);
  const { records } = await ctx.client.db.scrobbles
    .filter({
      $any: [{ "user_id.did": arg }, { "user_id.handle": arg }],
    })
    .getPaginated({
      pagination: {
        size: process.env.SYNC_SIZE ? parseInt(process.env.SYNC_SIZE) : 20,
      },
      sort: [{ xata_createdat: "desc" }],
    });
  for (const scrobble of records) {
    console.log(`Syncing scrobble ${chalk.cyan(scrobble.xata_id)} ...`);
    await publishScrobble(ctx, scrobble.xata_id);
  }
  console.log(`Synced ${chalk.greenBright(records.length)} scrobbles`);
}
