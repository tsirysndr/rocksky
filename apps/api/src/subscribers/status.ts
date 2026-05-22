import { consola } from "consola";
import type { Context } from "context";
import { JSONCodec } from "nats";
import { createAgent } from "lib/agent";
import type * as Status from "lexicon/types/app/rocksky/actor/status";
import type { TrackView } from "lexicon/types/app/rocksky/actor/defs";

const jc = JSONCodec();

interface SongChangedPayload {
  did: string;
  track: {
    // Spotify shape
    name?: string;
    artists?: { id: string; name: string }[];
    album?: { id: string; name: string; cover?: string };
    duration_ms?: number;
    progress_ms?: number;
    // ListenBrainz shape
    artist?: string;
    album_name?: string;
  };
}

interface SongStoppedPayload {
  did: string;
}

function normalizeTrack(
  raw: SongChangedPayload["track"],
  source: string,
): TrackView {
  // Spotify emits: track.name, track.artists[], track.album.{name,cover}, track.duration_ms
  // ListenBrainz emits: track.name, track.artist, track.album, track.duration_ms
  const name = raw.name ?? "";
  const artist = raw.artists?.[0]?.name ?? raw.artist ?? "";
  const album = raw.album?.name ?? raw.album_name;
  const albumCoverUrl = raw.album?.cover ?? undefined;
  const durationMs = raw.duration_ms ?? 0;

  return { name, artist, album, albumCoverUrl, durationMs, source };
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

        // Detect source from payload shape
        const source = rawTrack.artists ? "spotify" : "listenbrainz";

        const agent = await createAgent(ctx.oauthClient, did);
        if (!agent) {
          consola.warn(`[status] No agent for ${did}, skipping song.changed`);
          continue;
        }

        const track = normalizeTrack(rawTrack, source);
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
          `[status] Updated status for ${did}: ${track.artist} – ${track.name}`,
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
