import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { env } from "../lib/env.js";
import { c } from "../theme.js";
import { logger as log } from "../logger.js";
import { getDidAndHandle } from "../lib/getDidAndHandle.js";
import { WebScrobbler, Listenbrainz, Lastfm } from "../types.js";
import { matchTrack } from "../lib/matchTrack.js";
import { publishScrobble } from "../scrobble.js";
import { validateLastfmSignature } from "../lib/lastfm.js";
import { sync } from "./sync.js";
async function scrobbleApi({ port }) {
  const [, handle] = await getDidAndHandle();
  const app = new Hono();
  if (!process.env.ROCKSKY_API_KEY || !process.env.ROCKSKY_SHARED_SECRET || !process.env.ROCKSKY_SESSION_KEY) {
    console.log(`ROCKSKY_API_KEY: ${env.ROCKSKY_API_KEY}`);
    console.log(`ROCKSKY_SHARED_SECRET: ${env.ROCKSKY_SHARED_SECRET}`);
    console.log(`ROCKSKY_SESSION_KEY: ${env.ROCKSKY_SESSION_KEY}`);
  } else {
    console.log(
      "ROCKSKY_API_KEY, ROCKSKY_SHARED_SECRET and ROCKSKY_SESSION_KEY are set from environment variables"
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
  console.log(c.primary(BANNER));
  app.use(logger());
  app.use(cors());
  app.get(
    "/",
    (c2) => c2.text(
      `${BANNER}
Welcome to the lastfm/listenbrainz/webscrobbler compatibility API
`
    )
  );
  app.post("/nowplaying", async (c2) => {
    const formData = await c2.req.parseBody();
    const params = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, String(v)])
    );
    if (params.s !== env.ROCKSKY_SESSION_KEY) {
      return c2.text("BADSESSION\n");
    }
    const {
      data: nowPlaying,
      success,
      error
    } = Lastfm.LegacyNowPlayingRequestSchema.safeParse(params);
    if (!success) {
      return c2.text(`FAILED Invalid request: ${error}
`);
    }
    log.info`Legacy API - Now playing: ${nowPlaying.t} by ${nowPlaying.a}`;
    return c2.text("OK\n");
  });
  app.post("/submission", async (c2) => {
    const formData = await c2.req.parseBody();
    const params = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, String(v)])
    );
    if (params.s !== env.ROCKSKY_SESSION_KEY) {
      return c2.text("BADSESSION\n");
    }
    const {
      data: submission,
      success,
      error
    } = Lastfm.LegacySubmissionRequestSchema.safeParse(params);
    if (!success) {
      return c2.text(`FAILED Invalid request: ${error}
`);
    }
    log.info`Legacy API - Received scrobble: ${submission["t[0]"]} by ${submission["a[0]"]}`;
    (async () => {
      const track = submission["t[0]"];
      const artist = submission["a[0]"];
      const album = submission["b[0]"];
      const timestamp = parseInt(submission["i[0]"]);
      const match = await matchTrack(track, artist, album);
      if (!match) {
        log.warn`No match found for ${track} by ${artist}`;
        return;
      }
      await publishScrobble(match, timestamp);
    })().catch((err) => {
      log.error`Error processing legacy API scrobble: ${err}`;
    });
    return c2.text("OK\n");
  });
  app.get("/2.0", async (c2) => {
    const params = Object.fromEntries(
      Object.entries(c2.req.query()).map(([k, v]) => [k, String(v)])
    );
    if (params.method === "auth.getSession") {
      if (params.api_key !== env.ROCKSKY_API_KEY) {
        return c2.json({
          error: 10,
          message: "Invalid API key"
        });
      }
      if (!validateLastfmSignature(params)) {
        return c2.json({
          error: 13,
          message: "Invalid method signature supplied"
        });
      }
      return c2.json({
        session: {
          name: handle,
          key: env.ROCKSKY_SESSION_KEY,
          subscriber: 0
        }
      });
    }
    return c2.text(`${BANNER}
Welcome to the lastfm compatibility API
`);
  });
  app.post("/2.0", async (c2) => {
    const contentType = c2.req.header("content-type");
    let params = {};
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      const formData = await c2.req.parseBody();
      params = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, String(v)])
      );
    } else {
      params = await c2.req.json();
    }
    log.info`Received Last.fm API request: method=${params.method}`;
    if (params.api_key !== env.ROCKSKY_API_KEY) {
      return c2.json({
        error: 10,
        message: "Invalid API key"
      });
    }
    if (!validateLastfmSignature(params)) {
      return c2.json({
        error: 13,
        message: "Invalid method signature supplied"
      });
    }
    if (params.method === "auth.getSession") {
      return c2.json({
        session: {
          name: handle,
          key: env.ROCKSKY_SESSION_KEY,
          subscriber: 0
        }
      });
    }
    if (params.method === "track.updateNowPlaying") {
      if (params.sk !== env.ROCKSKY_SESSION_KEY) {
        return c2.json({
          error: 9,
          message: "Invalid session key"
        });
      }
      log.info`Now playing: ${params.track} by ${params.artist}`;
      return c2.json({
        nowplaying: {
          artist: { "#text": params.artist },
          track: { "#text": params.track },
          album: { "#text": params.album || "" },
          ignoredMessage: { code: "0", "#text": "" }
        }
      });
    }
    if (params.method === "track.scrobble") {
      if (params.sk !== env.ROCKSKY_SESSION_KEY) {
        return c2.json({
          error: 9,
          message: "Invalid session key"
        });
      }
      const track = params["track[0]"] || params.track;
      const artist = params["artist[0]"] || params.artist;
      const album = params["album[0]"] || params.album;
      const timestamp = params["timestamp[0]"] || params.timestamp;
      log.info`Received Last.fm scrobble: ${track} by ${artist}`;
      (async () => {
        const match = await matchTrack(track, artist, album);
        if (!match) {
          log.warn`No match found for ${track} by ${artist}`;
          return;
        }
        const ts = timestamp ? parseInt(timestamp) : Math.floor(Date.now() / 1e3);
        await publishScrobble(match, ts);
      })().catch((err) => {
        log.error`Error processing Last.fm scrobble: ${err}`;
      });
      return c2.json({
        scrobbles: {
          "@attr": {
            accepted: 1,
            ignored: 0
          },
          scrobble: {
            artist: { "#text": artist },
            track: { "#text": track },
            album: { "#text": params["album[0]"] || params.album || "" },
            timestamp: timestamp || String(Math.floor(Date.now() / 1e3)),
            ignoredMessage: { code: "0", "#text": "" }
          }
        }
      });
    }
    return c2.json({
      error: 3,
      message: "Invalid method"
    });
  });
  app.post("/1/submit-listens", async (c2) => {
    const authHeader = c2.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Token ")) {
      return c2.json(
        {
          code: 401,
          error: "Unauthorized"
        },
        401
      );
    }
    const token = authHeader.substring(6);
    if (token !== env.ROCKSKY_API_KEY) {
      return c2.json(
        {
          code: 401,
          error: "Invalid token"
        },
        401
      );
    }
    const body = await c2.req.json();
    const {
      data: submitRequest,
      success,
      error
    } = Listenbrainz.SubmitListensRequestSchema.safeParse(body);
    if (!success) {
      return c2.json(
        {
          code: 400,
          error: `Invalid request body: ${error}`
        },
        400
      );
    }
    log.info`Received ListenBrainz submit-listens request with ${submitRequest.payload.length} payload(s)`;
    if (submitRequest.listen_type !== "single") {
      log.info`Skipping listen_type: ${submitRequest.listen_type} (only "single" is processed)`;
      return c2.json({
        status: "ok",
        payload: {
          submitted_listens: 0,
          ignored_listens: 1
        },
        code: 200
      });
    }
    (async () => {
      for (const listen of submitRequest.payload) {
        const title = listen.track_metadata.track_name;
        const artist = listen.track_metadata.artist_name;
        const album = listen.track_metadata.release_name;
        log.info`Processing listen: ${title} by ${artist}`;
        const match = await matchTrack(title, artist, album);
        if (!match) {
          log.warn`No match found for ${title} by ${artist}`;
          continue;
        }
        const timestamp = listen.listened_at || Math.floor(Date.now() / 1e3);
        await publishScrobble(match, timestamp);
      }
    })().catch((err) => {
      log.error`Error processing ListenBrainz scrobbles: ${err}`;
    });
    return c2.json({
      status: "ok",
      code: 200
    });
  });
  app.get("/1/validate-token", (c2) => {
    const authHeader = c2.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Token ")) {
      return c2.json({
        code: 401,
        message: "Unauthorized",
        valid: false
      });
    }
    const token = authHeader.substring(6);
    if (token !== env.ROCKSKY_API_KEY) {
      return c2.json({
        code: 401,
        message: "Invalid token",
        valid: false
      });
    }
    return c2.json({
      code: 200,
      message: "Token valid.",
      valid: true,
      user_name: handle,
      permissions: ["recording-metadata-write", "recording-metadata-read"]
    });
  });
  app.get("/1/search/users", (c2) => {
    return c2.json([]);
  });
  app.get("/1/user/:username/listens", (c2) => {
    return c2.json([]);
  });
  app.get("/1/user/:username/listen-count", (c2) => {
    return c2.json({});
  });
  app.get("/1/user/:username/playing-now", (c2) => {
    return c2.json({});
  });
  app.get("/1/stats/user/:username/artists", (c2) => {
    return c2.json({});
  });
  app.get("/1/stats/user/:username}/releases", (c2) => {
    return c2.json({});
  });
  app.get("/1/stats/user/:username/recordings", (c2) => {
    return c2.json([]);
  });
  app.get("/1/stats/user/:username/release-groups", (c2) => {
    return c2.json([]);
  });
  app.get("/1/stats/user/:username/recordings", (c2) => {
    return c2.json({});
  });
  app.post("/webscrobbler/:uuid", async (c2) => {
    const { uuid } = c2.req.param();
    if (uuid !== env.ROCKSKY_WEBSCROBBLER_KEY) {
      return c2.text("Invalid UUID", 401);
    }
    const body = await c2.req.json();
    const {
      data: scrobble,
      success,
      error
    } = WebScrobbler.ScrobbleRequestSchema.safeParse(body);
    if (!success) {
      return c2.text(`Invalid request body: ${error}`, 400);
    }
    log.info`Received scrobble request: \n ${scrobble}`;
    const title = scrobble.data?.song?.parsed?.track;
    const artist = scrobble.data?.song?.parsed?.artist;
    const album = scrobble.data?.song?.parsed?.album;
    const match = await matchTrack(title, artist, album);
    if (!match) {
      log.warn`No match found for ${title} by ${artist}`;
      return c2.text("No match found", 200);
    }
    await publishScrobble(match, scrobble.time);
    return c2.text("Scrobble received");
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
export {
  scrobbleApi
};
