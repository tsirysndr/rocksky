import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "lib/env";
import chalk from "chalk";
import { logger as log } from "logger";
import { getDidAndHandle } from "lib/getDidAndHandle";
import { WebScrobbler, Listenbrainz } from "types";
import { matchTrack } from "lib/matchTrack";
import _ from "lodash";
import { publishScrobble } from "scrobble";

export async function scrobbleApi({ port }) {
  const [, handle] = await getDidAndHandle();
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

  app.post("/nowplaying", (c) => {
    return c.text("");
  });

  app.post("/submission", (c) => {
    return c.text("");
  });

  app.get("/2.0", (c) => {
    return c.text(`${BANNER}\nWelcome to the lastfm compatibility API\n`);
  });

  app.post("/2.0", (c) => {
    return c.text("");
  });

  app.post("/1/submit-listens", async (c) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Token ")) {
      return c.json(
        {
          code: 401,
          error: "Unauthorized",
        },
        401,
      );
    }

    const token = authHeader.substring(6); // Remove "Token " prefix
    if (token !== env.ROCKSKY_API_KEY) {
      return c.json(
        {
          code: 401,
          error: "Invalid token",
        },
        401,
      );
    }

    const body = await c.req.json();
    const {
      data: submitRequest,
      success,
      error,
    } = Listenbrainz.SubmitListensRequestSchema.safeParse(body);

    if (!success) {
      return c.json(
        {
          code: 400,
          error: `Invalid request body: ${error}`,
        },
        400,
      );
    }

    log.info`Received ListenBrainz submit-listens request with ${submitRequest.payload.length} payload(s)`;

    if (submitRequest.listen_type !== "single") {
      log.info`Skipping listen_type: ${submitRequest.listen_type} (only "single" is processed)`;
      return c.json({
        status: "ok",
        payload: {
          submitted_listens: 0,
          ignored_listens: 1,
        },
        code: 200,
      });
    }

    // Process scrobbles asynchronously to avoid timeout
    (async () => {
      for (const listen of submitRequest.payload) {
        const title = listen.track_metadata.track_name;
        const artist = listen.track_metadata.artist_name;

        log.info`Processing listen: ${title} by ${artist}`;

        const match = await matchTrack(title, artist);

        if (!match) {
          log.warn`No match found for ${title} by ${artist}`;
          continue;
        }

        const timestamp = listen.listened_at || Math.floor(Date.now() / 1000);
        await publishScrobble(match, timestamp);
      }
    })().catch((err) => {
      log.error`Error processing ListenBrainz scrobbles: ${err}`;
    });

    return c.json({
      status: "ok",
      code: 200,
    });
  });

  app.get("/1/validate-token", (c) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Token ")) {
      return c.json({
        code: 401,
        message: "Unauthorized",
        valid: false,
      });
    }

    const token = authHeader.substring(6); // Remove "Token " prefix
    if (token !== env.ROCKSKY_API_KEY) {
      return c.json({
        code: 401,
        message: "Invalid token",
        valid: false,
      });
    }

    return c.json({
      code: 200,
      message: "Token valid.",
      valid: true,
      user_name: handle,
      permissions: ["recording-metadata-write", "recording-metadata-read"],
    });
  });

  app.get("/1/search/users", (c) => {
    return c.json([]);
  });

  app.get("/1/user/:username/listens", (c) => {
    return c.json([]);
  });

  app.get("/1/user/:username/listen-count", (c) => {
    return c.json({});
  });

  app.get("/1/user/:username/playing-now", (c) => {
    return c.json({});
  });

  app.get("/1/stats/user/:username/artists", (c) => {
    return c.json({});
  });

  app.get("/1/stats/user/:username}/releases", (c) => {
    return c.json({});
  });

  app.get("/1/stats/user/:username/recordings", (c) => {
    return c.json([]);
  });

  app.get("/1/stats/user/:username/release-groups", (c) => {
    return c.json([]);
  });

  app.get("/1/stats/user/:username/recordings", (c) => {
    return c.json({});
  });

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
