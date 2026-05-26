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

function rateLimitResetMsg(err: any): string {
  const headers = err?.headers ?? err?.response?.headers ?? err?.error?.headers;
  const reset = headers?.["ratelimit-reset"] ?? headers?.["x-ratelimit-reset"];
  const retryAfter = headers?.["retry-after"];
  if (reset) {
    const resetDate = new Date(Number(reset) * 1000);
    return ` — rate limit resets at ${resetDate.toISOString()} (in ${Math.max(0, Math.round((resetDate.getTime() - Date.now()) / 1000))}s)`;
  }
  if (retryAfter) {
    return ` — retry after ${retryAfter}s`;
  }
  return "";
}

// Last status successfully written to the PDS per DID.
// Tracks key ("name:artist") and source so Navidrome can override a Rockbox
// entry for the same track without being deduped.
const lastPushedStatus = new Map<string, { key: string; source: string } | null>();

// Unix ms timestamp until which PDS writes are suppressed for a given DID.
// Set when a 429 is received; cleared automatically once the time passes.
const rateLimitedUntil = new Map<string, number>();

function isRateLimited(did: string): boolean {
  const until = rateLimitedUntil.get(did);
  if (!until) return false;
  if (Date.now() >= until) {
    rateLimitedUntil.delete(did);
    return false;
  }
  return true;
}

function applyRateLimitBackoff(did: string, err: any): void {
  const headers = err?.headers ?? err?.response?.headers ?? err?.error?.headers;
  const reset = headers?.["ratelimit-reset"] ?? headers?.["x-ratelimit-reset"];
  const retryAfter = headers?.["retry-after"];
  let until: number;
  if (reset) {
    until = Number(reset) * 1000;
  } else if (retryAfter) {
    until = Date.now() + Number(retryAfter) * 1000;
  } else {
    until = Date.now() + 60_000; // conservative 1-minute fallback
  }
  rateLimitedUntil.set(did, until);
}

export function onSongChanged(ctx: Context) {
  const sub = ctx.nc.subscribe("rocksky.song.changed");
  (async () => {
    for await (const m of sub) {
      let did = "(unknown)";
      try {
        const payload = jc.decode(m.data) as SongChangedPayload;
        did = payload.did;
        const { track: rawTrack } = payload;

        if (isRateLimited(did)) {
          consola.debug(`[status] song.changed skipped for ${did} — PDS rate limited until ${new Date(rateLimitedUntil.get(did)!).toISOString()}`);
          continue;
        }

        const trackKey = `${rawTrack.name ?? ""}:${rawTrack.artists?.[0]?.name ?? rawTrack.artist ?? ""}`;
        const source = rawTrack.source ?? (rawTrack.artists ? "spotify" : "listenbrainz");
        const last = lastPushedStatus.get(did);
        // Skip only when the same track was already written by the same source.
        // A different source (e.g. Navidrome after Rockbox) is always allowed through
        // so the active player can take ownership of the status record.
        if (last && last.key === trackKey && last.source === source) {
          consola.debug(`[status] skip unchanged status for ${did}: ${rawTrack.name}`);
          continue;
        }

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

        lastPushedStatus.set(did, { key: trackKey, source });

        // When Navidrome is the source, clear ws_lastsong so a stale status=0
        // from Rockbox cannot fire song.stopped and delete this record.
        // Do NOT update lastsong here — Rockbox heartbeats use lastsong to dedup
        // themselves, and changing it would make Rockbox's last-played track look
        // "new", causing it to fire song.changed and overwrite this record.
        if (source === "navidrome") {
          await ctx.redis.del(`ws_lastsong:${did}`);
        }

        // Auto-expire the in-memory dedup after the track duration so that a
        // replay of the same song after ATProto record expiry (expiresAt) will
        // re-write the record rather than being silently deduplicated.
        if (track.durationMs > 0) {
          const keySnapshot = trackKey;
          const sourceSnapshot = source;
          setTimeout(() => {
            const current = lastPushedStatus.get(did);
            if (current && current.key === keySnapshot && current.source === sourceSnapshot) {
              lastPushedStatus.delete(did);
            }
          }, track.durationMs + 10_000);
        }

        consola.info(
          `[status] Updated status for ${did}: ${track.artist} – ${track.name}${recordingMbId ? ` (${recordingMbId})` : ""}`,
        );
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status ?? err?.error?.status;
        const message = err?.message ?? err?.error?.message ?? String(err);
        if (status === 429) {
          applyRateLimitBackoff(did, err);
          consola.warn(`[status] song.changed rate limited for ${did}${rateLimitResetMsg(err)}`);
        } else {
          consola.error(`[status] Error handling song.changed for ${did} — HTTP ${status ?? "?"}: ${message}`);
        }
      }
    }
  })();
}

export function onSongStopped(ctx: Context) {
  const sub = ctx.nc.subscribe("rocksky.song.stopped");
  (async () => {
    for await (const m of sub) {
      let did = "(unknown)";
      try {
        ({ did } = jc.decode(m.data) as SongStoppedPayload);

        if (isRateLimited(did)) {
          consola.debug(`[status] song.stopped skipped for ${did} — PDS rate limited until ${new Date(rateLimitedUntil.get(did)!).toISOString()}`);
          continue;
        }

        if (lastPushedStatus.get(did) === null) {
          consola.debug(`[status] skip already-stopped status for ${did}`);
          continue;
        }

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

        lastPushedStatus.set(did, null);
        consola.info(`[status] Cleared status for ${did}`);
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status ?? err?.error?.status;
        if (status === 400 || status === 404) continue; // already gone, not an error
        const message = err?.message ?? err?.error?.message ?? String(err);
        if (status === 429) {
          applyRateLimitBackoff(did, err);
          consola.warn(`[status] song.stopped rate limited for ${did}${rateLimitResetMsg(err)}`);
        } else {
          consola.error(`[status] Error handling song.stopped for ${did} — HTTP ${status ?? "?"}: ${message}`);
        }
      }
    }
  })();
}
