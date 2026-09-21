import { consola } from "consola";
import type { Context } from "context";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  notExists,
  sql,
} from "drizzle-orm";
import { Cache, Data, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistTracks";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import { deepCamelCaseKeys } from "lib";
import { creditsArtist } from "lib/credits";
import { transientDbRetry } from "lib/dbRetry";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(10),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("10 seconds"),
      ),
  });

  const getArtistTracks = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(Data.struct({ ...params }))),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ tracks: [] });
      }),
    );

  server.app.rocksky.artist.getArtistTracks({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistTracks(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

/** How many of the artist's tracks have been played at least once. */
const playedTrackCount = async (ctx: Context, artistId: string) =>
  ctx.readDb
    .select({ trackId: tables.scrobbles.trackId })
    .from(tables.scrobbles)
    .where(eq(tables.scrobbles.artistId, artistId))
    .groupBy(tables.scrobbles.trackId)
    .execute()
    .then((rows) => rows.length);

/**
 * The artist's tracks nobody has played, oldest junction row first.
 *
 * This is the one place `artist_tracks` is read, so it is the one place that
 * needs `creditsArtist`: a stray row would otherwise hand a stranger's track
 * to the tail of the page. The credit check cannot be pushed into the
 * statement — the database folds case for ASCII only (see lib/credits) — so
 * the rows are filtered here and paged afterwards.
 */
const unplayedTracks = async (
  ctx: Context,
  artist: { id: string; name: string },
  limit: number,
  offset: number,
) => {
  const rows = await ctx.readDb
    .select({
      trackId: tables.artistTracks.trackId,
      artist: tables.tracks.artist,
      albumArtist: tables.tracks.albumArtist,
    })
    .from(tables.artistTracks)
    .innerJoin(tables.tracks, eq(tables.tracks.id, tables.artistTracks.trackId))
    .where(
      and(
        eq(tables.artistTracks.artistId, artist.id),
        notExists(
          ctx.readDb
            .select({ one: sql`1` })
            .from(tables.scrobbles)
            .where(
              and(
                eq(tables.scrobbles.artistId, artist.id),
                eq(tables.scrobbles.trackId, tables.artistTracks.trackId),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(tables.artistTracks.trackId))
    .execute();

  return rows
    .filter((row) => creditsArtist(artist.name, row))
    .slice(offset, offset + limit);
};

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: Track[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 100;
      const offset = params.offset ?? 0;

      const artist = await ctx.readDb
        .select({ id: tables.artists.id, name: tables.artists.name })
        .from(tables.artists)
        .where(eq(tables.artists.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      if (!artist) return { data: [] };

      // The ranking runs over `scrobbles`, not over the junction: the rows
      // have to be ordered by plays *before* the page is cut (slicing the
      // junction and sorting the slice only looks sorted), and a scrobble's
      // artist_id and track_id are written together in one transaction, so
      // unlike `artist_tracks` they never disagree. `artist_tracks` has stray
      // rows pointing at other artists' recordings — that is what put "Baby"
      // by Cannons in Slipknot's popular tracks — and ranking here never
      // reads them.
      const ranked = await ctx.readDb
        .select({
          trackId: tables.scrobbles.trackId,
          play_count: count(tables.scrobbles.id),
          unique_listeners: countDistinct(tables.scrobbles.userId),
        })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.artistId, artist.id))
        .groupBy(tables.scrobbles.trackId)
        // Ties break by id so paging is stable — without it two tracks with
        // the same count can swap between pages, one shown twice and one
        // never.
        .orderBy(
          desc(count(tables.scrobbles.id)),
          asc(tables.scrobbles.trackId),
        )
        .limit(limit)
        .offset(offset)
        .execute()
        .then((rows) =>
          rows.filter((r): r is typeof r & { trackId: string } => !!r.trackId),
        );

      // A page the plays could not fill is topped up from the junction, so an
      // artist whose library was uploaded but never played still lists their
      // tracks. Only these rows need the credit guard (see lib/credits), and
      // only a page this short ever pays for it.
      const unplayed =
        ranked.length < limit
          ? await unplayedTracks(
              ctx,
              artist,
              limit - ranked.length,
              // Page one starts at the first unplayed track; later pages skip
              // the played ones the earlier pages already showed.
              offset === 0
                ? 0
                : Math.max(
                    0,
                    offset - (await playedTrackCount(ctx, artist.id)),
                  ),
            )
          : [];

      if (ranked.length === 0 && unplayed.length === 0) return { data: [] };

      const trackIds = [
        ...ranked.map((r) => r.trackId),
        ...unplayed.map((r) => r.trackId),
      ];

      const tracks = await ctx.readDb
        .select({
          id: tables.tracks.id,
          title: tables.tracks.title,
          artist: tables.tracks.artist,
          albumArtist: tables.tracks.albumArtist,
          albumArt: tables.tracks.albumArt,
          album: tables.tracks.album,
          uri: tables.tracks.uri,
          albumUri: tables.tracks.albumUri,
          artistUri: tables.tracks.artistUri,
          sha256: tables.tracks.sha256,
          trackNumber: tables.tracks.trackNumber,
          discNumber: tables.tracks.discNumber,
          duration: tables.tracks.duration,
          copyrightMessage: tables.tracks.copyrightMessage,
          createdAt: tables.tracks.createdAt,
        })
        .from(tables.tracks)
        .where(inArray(tables.tracks.id, trackIds))
        .execute();

      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      const playCountMap = new Map(
        ranked.map((r) => [r.trackId, Number(r.play_count)]),
      );
      const listenersMap = new Map(
        ranked.map((r) => [r.trackId, Number(r.unique_listeners)]),
      );

      const data: Track[] = trackIds
        .map((id) => {
          const track = trackMap.get(id);
          if (!track) return null;
          return {
            id: track.id,
            uri: track.uri,
            title: track.title,
            artist: track.artist,
            artist_uri: track.artistUri,
            album: track.album,
            album_uri: track.albumUri,
            album_art: track.albumArt,
            album_artist: track.albumArtist,
            copyright_message: track.copyrightMessage,
            disc_number: track.discNumber,
            duration: track.duration,
            sha256: track.sha256,
            track_number: track.trackNumber,
            play_count: playCountMap.get(id) ?? 0,
            unique_listeners: listenersMap.get(id) ?? 0,
            created_at: track.createdAt.toISOString(),
          };
        })
        .filter((t): t is Track => t !== null);

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve artist's tracks: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Track[];
}): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({ tracks: deepCamelCaseKeys(data) }));
};

type Track = {
  id: string;
  uri: string | null;
  unique_listeners: number;
  play_count: number;
  title: string;
  artist: string;
  artist_uri: string | null;
  album: string;
  album_uri: string | null;
  album_art: string | null;
  album_artist: string;
  copyright_message: string | null;
  disc_number: number | null;
  duration: number;
  sha256: string;
  track_number: number | null;
  created_at: string;
};
