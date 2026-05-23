import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { JSONCodec } from "nats";
import { createHash } from "node:crypto";
import { createAgent } from "lib/agent";
import type * as Status from "lexicon/types/app/rocksky/actor/status";
import type { TrackView } from "lexicon/types/app/rocksky/actor/defs";
import tracks from "schema/tracks";

const jc = JSONCodec();

interface SongChangedPayload {
  did: string;
  track: {
    name?: string;
    // Spotify: structured artists + album object
    artists?: { id: string; name: string }[];
    album?: { id: string; name: string; cover?: string } | string;
    duration_ms?: number;
    progress_ms?: number;
    // ListenBrainz / websocket: flat strings
    artist?: string;
    album_name?: string;
    albumCoverUrl?: string;
    recording_mb_id?: string;
    source?: string;
  };
}

interface SongStoppedPayload {
  did: string;
}

async function resolveTrackInfo(
  ctx: Context,
  raw: SongChangedPayload["track"],
): Promise<{
  recordingMbId: string | undefined;
  albumArt: string | undefined;
}> {
  const name = raw.name ?? "";
  const artist = raw.artists?.[0]?.name ?? raw.artist ?? "";
  const album =
    (typeof raw.album === "object" ? raw.album?.name : raw.album) ??
    raw.album_name ??
    "";

  // 1. Already provided in the payload (e.g. from ListenBrainz)
  let recordingMbId: string | undefined = raw.recording_mb_id;
  let albumArt: string | undefined;

  if (!name || !artist) return { recordingMbId, albumArt };

  // 2. Look up by sha256 in the local DB — fetch both mbId and albumArt
  const sha256 = createHash("sha256")
    .update(`${name} - ${artist} - ${album}`.toLowerCase())
    .digest("hex");

  const [track] = await ctx.db
    .select({ mbId: tracks.mbId, albumArt: tracks.albumArt })
    .from(tracks)
    .where(eq(tracks.sha256, sha256))
    .limit(1)
    .execute();

  if (!recordingMbId && track?.mbId) recordingMbId = track.mbId;
  if (track?.albumArt) albumArt = track.albumArt;

  if (recordingMbId) return { recordingMbId, albumArt };

  // 3. Fall back to MusicBrainz /hydrate
  try {
    const body: { artist: { name: string }[]; name: string; album?: string } = {
      artist: artist.split(",").map((a) => ({ name: a.trim() })),
      name,
    };
    if (album) body.album = album;

    const { data } = await ctx.musicbrainz.post<{ trackMBID?: string }>(
      "/hydrate",
      body,
    );

    return { recordingMbId: data?.trackMBID ?? undefined, albumArt };
  } catch (err) {
    consola.warn("[status] MusicBrainz hydrate failed:", err);
    return { recordingMbId, albumArt };
  }
}

function normalizeTrack(
  raw: SongChangedPayload["track"],
  recordingMbId: string | undefined,
  dbAlbumArt?: string,
): TrackView {
  // Spotify emits: name, artists[], album.{name,cover}, duration_ms
  // ListenBrainz/websocket emits: name, artist, album (string), duration_ms, albumCoverUrl
  const name = raw.name ?? "";
  const artist = raw.artists?.[0]?.name ?? raw.artist ?? "";
  const album =
    (typeof raw.album === "object" ? raw.album?.name : raw.album) ??
    raw.album_name;
  const albumCoverUrl =
    (typeof raw.album === "object" ? raw.album?.cover : undefined) ??
    raw.albumCoverUrl ??
    dbAlbumArt;
  const durationMs = raw.duration_ms ?? 0;
  const source = raw.source ?? (raw.artists ? "spotify" : "listenbrainz");

  return {
    name,
    artist,
    album,
    albumCoverUrl,
    durationMs,
    source,
    recordingMbId,
  };
}

async function getSwapCid(
  agent: Awaited<ReturnType<typeof createAgent>>,
): Promise<string | undefined> {
  try {
    const res = await agent!.com.atproto.repo.getRecord({
      repo: agent!.assertDid,
      collection: "app.rocksky.actor.status",
      rkey: "self",
    });
    return res.data.cid;
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status;
    if (status === 400 || status === 404) return undefined;
    throw err;
  }
}

export function onSongChanged(ctx: Context) {
  const sub = ctx.nc.subscribe("rocksky.song.changed");
  (async () => {
    for await (const m of sub) {
      try {
        const payload = jc.decode(m.data) as SongChangedPayload;
        const { did, track: rawTrack } = payload;

        const [agent, { recordingMbId, albumArt }] = await Promise.all([
          createAgent(ctx.oauthClient, did),
          resolveTrackInfo(ctx, rawTrack),
        ]);

        if (!agent) {
          consola.warn(`[status] No agent for ${did}, skipping song.changed`);
          continue;
        }

        const track = normalizeTrack(rawTrack, recordingMbId, albumArt);
        const startedAt = new Date().toISOString();
        const expiresAt = track.durationMs
          ? new Date(Date.now() + track.durationMs).toISOString()
          : undefined;

        const record: Status.Record = {
          $type: "app.rocksky.actor.status",
          track,
          startedAt,
          expiresAt,
        };

        const swapRecord = await getSwapCid(agent);
        await agent.com.atproto.repo.putRecord({
          repo: agent.assertDid,
          collection: "app.rocksky.actor.status",
          rkey: "self",
          record,
          swapRecord,
          validate: false,
        });

        consola.info(
          `[status] Updated status for ${did}: ${track.artist} – ${track.name}${recordingMbId ? ` (${recordingMbId})` : ""}`,
        );
      } catch (err) {
        consola.error("[status] Error handling song.changed:", err);
      }
    }
  })();
}

export function onSongStopped(ctx: Context) {
  const sub = ctx.nc.subscribe("rocksky.song.stopped");
  (async () => {
    for await (const m of sub) {
      try {
        const { did } = jc.decode(m.data) as SongStoppedPayload;

        const agent = await createAgent(ctx.oauthClient, did);
        if (!agent) {
          consola.warn(`[status] No agent for ${did}, skipping song.stopped`);
          continue;
        }

        await agent.com.atproto.repo.deleteRecord({
          repo: agent.assertDid,
          collection: "app.rocksky.actor.status",
          rkey: "self",
        });

        consola.info(`[status] Cleared status for ${did}`);
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        if (status === 400 || status === 404) return; // already gone
        consola.error("[status] Error handling song.stopped:", err);
      }
    }
  })();
}
