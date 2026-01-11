import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "lib/env";
import chalk from "chalk";
import { logger as log } from "logger";
import { getDidAndHandle } from "lib/getDidAndHandle";
import { WebScrobbler } from "types";
import { matchTrack } from "lib/matchTrack";
import _ from "lodash";
import { publishScrobble } from "scrobble";

export async function scrobbleApi({ port }) {
  await getDidAndHandle();
  const app = new Hono();

  if (!process.env.ROCKSKY_API_KEY || !process.env.ROCKSKY_SHARED_SECRET) {
    console.log(`ROCKSKY_API_KEY: ${env.ROCKSKY_API_KEY}`);
    console.log(`ROCKSKY_SHARED_SECRET: ${env.ROCKSKY_SHARED_SECRET}`);
  } else {
    console.log(
      "ROCKSKY_API_KEY and ROCKSKY_SHARED_SECRET are set from environment variables",
    );
  }

  if (!process.env.ROCKSKY_WEBSCROBBLER_KEY) {
    console.log(`ROCKSKY_WEBSCROBBLER_KEY: ${env.ROCKSKY_WEBSCROBBLER_KEY}`);
  } else {
    console.log("ROCKSKY_WEBSCROBBLER_KEY is set from environment variables");
  }

  const BANNER = `
    ____             __        __
   / __ \\____  _____/ /_______/ /____  __
  / /_/ / __ \\/ ___/ //_/ ___/ //_/ / / /
 / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /
/_/ |_|\\____/\\___/_/|_/____/_/|_|\\__, /
                                /____/
  `;

  console.log(chalk.cyanBright(BANNER));

  app.use(logger());
  app.use(cors());

  app.get("/", (c) =>
    c.text(
      `${BANNER}\nWelcome to the lastfm/listenbrainz/webscrobbler compatibility API\n`,
    ),
  );

  app.post("/webscrobbler/:uuid", async (c) => {
    const { uuid } = c.req.param();
    if (uuid !== env.ROCKSKY_WEBSCROBBLER_KEY) {
      return c.text("Invalid UUID", 401);
    }

    const body = await c.req.json();
    const {
      data: scrobble,
      success,
      error,
    } = WebScrobbler.ScrobbleRequestSchema.safeParse(body);

    if (!success) {
      return c.text(`Invalid request body: ${error}`, 400);
    }

    log.info`Received scrobble request: \n ${scrobble}`;

    const title = scrobble.data?.song?.parsed?.track;
    const artist = scrobble.data?.song?.parsed?.artist;
    const match = await matchTrack(title, artist);

    if (!match) {
      log.warn`No match found for ${title} by ${artist}`;
      return c.text("No match found", 200);
    }

    await publishScrobble(match, scrobble.time);

    return c.text("Scrobble received");
  });

  log.info`lastfm/listenbrainz/webscrobbler scrobble API listening on ${"http://localhost:" + port}`;

  serve({ fetch: app.fetch, port });
}
