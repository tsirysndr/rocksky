import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "lib/env";
import chalk from "chalk";
import { logger as log } from "logger";
import { getDidAndHandle } from "lib/getDidAndHandle";
import { WebScrobbler, Listenbrainz, Lastfm } from "types";
import { matchTrack } from "lib/matchTrack";
import _ from "lodash";
import { publishScrobble } from "scrobble";
import { validateLastfmSignature } from "lib/lastfm";
import { sync } from "./sync";

export async function scrobbleApi({ port }) {
  const [, handle] = await getDidAndHandle();
  const app = new Hono();

  if (
    !process.env.ROCKSKY_API_KEY ||
    !process.env.ROCKSKY_SHARED_SECRET ||
    !process.env.ROCKSKY_SESSION_KEY
  ) {
    console.log(`ROCKSKY_API_KEY: ${env.ROCKSKY_API_KEY}`);
    console.log(`ROCKSKY_SHARED_SECRET: ${env.ROCKSKY_SHARED_SECRET}`);
    console.log(`ROCKSKY_SESSION_KEY: ${env.ROCKSKY_SESSION_KEY}`);
  } else {
    console.log(
      "ROCKSKY_API_KEY, ROCKSKY_SHARED_SECRET and ROCKSKY_SESSION_KEY are set from environment variables",
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

  app.post("/nowplaying", async (c) => {
    const formData = await c.req.parseBody();
    const params = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, String(v)]),
    );

    if (params.s !== env.ROCKSKY_SESSION_KEY) {
      return c.text("BADSESSION\n");
    }

    const {
      data: nowPlaying,
      success,
      error,
    } = Lastfm.LegacyNowPlayingRequestSchema.safeParse(params);

    if (!success) {
      return c.text(`FAILED Invalid request: ${error}\n`);
    }

    log.info`Legacy API - Now playing: ${nowPlaying.t} by ${nowPlaying.a}`;

    return c.text("OK\n");
  });

  app.post("/submission", async (c) => {
    const formData = await c.req.parseBody();
    const params = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, String(v)]),
    );

    if (params.s !== env.ROCKSKY_SESSION_KEY) {
      return c.text("BADSESSION\n");
    }

    const {
      data: submission,
      success,
      error,
    } = Lastfm.LegacySubmissionRequestSchema.safeParse(params);

    if (!success) {
      return c.text(`FAILED Invalid request: ${error}\n`);
    }

    log.info`Legacy API - Received scrobble: ${submission["t[0]"]} by ${submission["a[0]"]}`;

    // Process scrobble asynchronously
    (async () => {
      const track = submission["t[0]"];
      const artist = submission["a[0]"];
      const timestamp = parseInt(submission["i[0]"]);

      const match = await matchTrack(track, artist);

      if (!match) {
        log.warn`No match found for ${track} by ${artist}`;
        return;
      }

      await publishScrobble(match, timestamp);
    })().catch((err) => {
      log.error`Error processing legacy API scrobble: ${err}`;
    });

    return c.text("OK\n");
  });

  app.get("/2.0", async (c) => {
    const params = Object.fromEntries(
      Object.entries(c.req.query()).map(([k, v]) => [k, String(v)]),
    );

    if (params.method === "auth.getSession") {
      if (params.api_key !== env.ROCKSKY_API_KEY) {
        return c.json({
          error: 10,
          message: "Invalid API key",
        });
      }

      if (!validateLastfmSignature(params)) {
        return c.json({
          error: 13,
          message: "Invalid method signature supplied",
        });
      }

      return c.json({
        session: {
          name: handle,
          key: env.ROCKSKY_SESSION_KEY,
          subscriber: 0,
        },
      });
    }

    return c.text(`${BANNER}\nWelcome to the lastfm compatibility API\n`);
  });

  app.post("/2.0", async (c) => {
    const contentType = c.req.header("content-type");
    let params: Record<string, string> = {};

    if (contentType?.includes("application/x-www-form-urlencoded")) {
      const formData = await c.req.parseBody();
      params = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, String(v)]),
      );
    } else {
      params = await c.req.json();
    }

    log.info`Received Last.fm API request: method=${params.method}`;

    if (params.api_key !== env.ROCKSKY_API_KEY) {
      return c.json({
        error: 10,
        message: "Invalid API key",
      });
    }

    if (!validateLastfmSignature(params)) {
      return c.json({
        error: 13,
        message: "Invalid method signature supplied",
      });
    }

    if (params.method === "auth.getSession") {
      return c.json({
        session: {
          name: handle,
          key: env.ROCKSKY_SESSION_KEY,
          subscriber: 0,
        },
      });
    }

    if (params.method === "track.updateNowPlaying") {
      // Validate session key
      if (params.sk !== env.ROCKSKY_SESSION_KEY) {
        return c.json({
          error: 9,
          message: "Invalid session key",
        });
      }

      log.info`Now playing: ${params.track} by ${params.artist}`;
      return c.json({
        nowplaying: {
          artist: { "#text": params.artist },
          track: { "#text": params.track },
          album: { "#text": params.album || "" },
          ignoredMessage: { code: "0", "#text": "" },
        },
      });
    }

    if (params.method === "track.scrobble") {
      // Validate session key
      if (params.sk !== env.ROCKSKY_SESSION_KEY) {
        return c.json({
          error: 9,
          message: "Invalid session key",
        });
      }

      const track = params["track[0]"] || params.track;
      const artist = params["artist[0]"] || params.artist;
      const timestamp = params["timestamp[0]"] || params.timestamp;

      log.info`Received Last.fm scrobble: ${track} by ${artist}`;

      // Process scrobble asynchronously
      (async () => {
        const match = await matchTrack(track, artist);

        if (!match) {
          log.warn`No match found for ${track} by ${artist}`;
          return;
        }

        const ts = timestamp
          ? parseInt(timestamp)
          : Math.floor(Date.now() / 1000);
        await publishScrobble(match, ts);
      })().catch((err) => {
        log.error`Error processing Last.fm scrobble: ${err}`;
      });

      return c.json({
        scrobbles: {
          "@attr": {
            accepted: 1,
            ignored: 0,
          },
          scrobble: {
            artist: { "#text": artist },
            track: { "#text": track },
            album: { "#text": params["album[0]"] || params.album || "" },
            timestamp: timestamp || String(Math.floor(Date.now() / 1000)),
            ignoredMessage: { code: "0", "#text": "" },
          },
        },
      });
    }

    return c.json({
      error: 3,
      message: "Invalid method",
    });
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

  new Promise(async () => {
    try {
      await sync();
    } catch (err) {
      log.warn`Error during initial sync: ${err}`;
    }
  });
  serve({ fetch: app.fetch, port });
}
