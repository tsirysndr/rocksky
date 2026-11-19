import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "context";
import tracks from "schema/tracks";
import { matchTrack, matchingRequest } from "./matching";

type Listen = {
  inserted_at?: number;
  track_metadata: {
    track_name: string;
    artist_name: string;
    release_name?: string;
    additional_info?: {
      duration_ms?: number;
      music_service_name?: string;
      submission_client?: string;
    };
  };
};

// Cache metadata, never the playback clock. Share simultaneous profile polls.
export function createSubmittedNowPlaying(
  ctx: Pick<Context, "redis" | "db" | "matching">,
) {
  const cache = new Map<
    string,
    { expires: number; value: Promise<Record<string, unknown>> }
  >();
  async function enrich(listen: Listen) {
    const meta = listen.track_metadata;
    const album = meta.release_name ?? "";
    const hash = createHash("sha256")
      .update(
        `${meta.track_name} - ${meta.artist_name} - ${album}`.toLowerCase(),
      )
      .digest("hex");
    const [row] = await ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.sha256, hash))
      .limit(1);
    let candidate = null;
    if (!row?.albumArt?.trim()) {
      try {
        candidate = await matchTrack(
          ctx,
          matchingRequest({
            title: meta.track_name,
            artist: meta.artist_name,
            album,
            duration: meta.additional_info?.duration_ms,
          }),
          AbortSignal.timeout(2000),
        );
      } catch {
        /* Optional enrichment must not hide the submitted track. */
      }
    }
    return {
      album: album || candidate?.album || "",
      album_artist:
        row?.albumArtist || candidate?.albumArtist || meta.artist_name,
      album_art: row?.albumArt?.trim() || candidate?.albumArt || null,
      duration_ms: row?.duration || candidate?.durationMs || 0,
      song_uri: row?.uri ?? null,
      album_uri: row?.albumUri ?? null,
      artist_uri: row?.artistUri ?? null,
    };
  }
  return async (did: string) => {
    const raw = await ctx.redis.get(`listenbrainz:playing_now:${did}`);
    if (!raw) return {};
    const listen: Listen = JSON.parse(raw);
    const meta = listen.track_metadata;
    const info = meta.additional_info ?? {};
    let entry = cache.get(raw);
    if (!entry || entry.expires <= Date.now()) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      entry = { expires: Date.now() + 60_000, value: enrich(listen) };
      cache.set(raw, entry);
    }
    let metadata: Record<string, unknown> = {};
    try {
      metadata = await entry.value;
    } catch {
      cache.delete(raw);
    }
    const length = info.duration_ms || Number(metadata.duration_ms) || 0;
    const elapsed = length
      ? Math.min(
          Math.max(Date.now() - (listen.inserted_at ?? 0) * 1000, 0),
          length,
        )
      : 0;
    return {
      ...metadata,
      title: meta.track_name,
      artist: meta.artist_name,
      album: metadata.album ?? meta.release_name ?? null,
      length,
      elapsed,
      is_playing: true,
      device_name: info.music_service_name ?? info.submission_client ?? null,
    };
  };
}
