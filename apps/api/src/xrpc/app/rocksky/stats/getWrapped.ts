import type { Context } from "context";
import { consola } from "consola";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/stats/getWrapped";
import type { WrappedView } from "lexicon/types/app/rocksky/stats/defs";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(30),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getWrapped = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed(
          defaultWrapped(params.year ?? new Date().getFullYear()),
        );
      }),
    );

  server.app.rocksky.stats.getWrapped({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getWrapped(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<WrappedView, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const year = params.year ?? new Date().getFullYear();
      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${year + 1}-01-01T00:00:00.000Z`);

      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .execute()
        .then((rows) => rows[0]);

      if (!user) return defaultWrapped(year);

      const dateConditions = [
        gte(tables.scrobbles.timestamp, startDate),
        lt(tables.scrobbles.timestamp, endDate),
      ];
      const userAndDate = and(
        eq(tables.scrobbles.userId, user.id),
        ...dateConditions,
      );

      const [
        totalScrobblesRow,
        totalTimeRow,
        topTrackIds,
        topArtistIds,
        topAlbumIds,
        topGenresRows,
        mostActiveDayRow,
        mostActiveHourRow,
        scrobblesPerMonthRows,
        firstScrobbleRow,
        lastScrobbleRow,
        allDailyRows,
        newArtistRows,
      ] = await Promise.all([
        // Total scrobbles
        ctx.db
          .select({ n: count() })
          .from(tables.scrobbles)
          .where(userAndDate)
          .execute(),

        // Total listening time (sum of track durations)
        ctx.db
          .select({
            total: sql<number>`COALESCE(SUM(${tables.tracks.duration}), 0)`,
          })
          .from(tables.scrobbles)
          .innerJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(userAndDate)
          .execute(),

        // Top 5 track IDs by play count
        ctx.db
          .select({
            trackId: tables.scrobbles.trackId,
            playCount: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .where(userAndDate)
          .groupBy(tables.scrobbles.trackId)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(5)
          .execute(),

        // Top 5 artist IDs by play count (excluding Various Artists)
        ctx.db
          .select({
            artistId: tables.scrobbles.artistId,
            playCount: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .innerJoin(
            tables.artists,
            eq(tables.scrobbles.artistId, tables.artists.id),
          )
          .where(and(userAndDate, ne(tables.artists.name, "Various Artists")))
          .groupBy(tables.scrobbles.artistId)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(5)
          .execute(),

        // Top 5 album IDs by play count
        ctx.db
          .select({
            albumId: tables.scrobbles.albumId,
            playCount: count(tables.scrobbles.id).as("play_count"),
          })
          .from(tables.scrobbles)
          .where(and(userAndDate, sql`${tables.scrobbles.albumId} IS NOT NULL`))
          .groupBy(tables.scrobbles.albumId)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(5)
          .execute(),

        // Top genres from artist genres array (unnested)
        ctx.db.execute(
          sql`
            SELECT genre, COUNT(*) AS genre_count
            FROM (
              SELECT unnest(${tables.artists.genres}) AS genre
              FROM ${tables.scrobbles}
              INNER JOIN ${tables.artists} ON ${tables.artists.id} = ${tables.scrobbles.artistId}
              WHERE ${tables.scrobbles.userId} = ${user.id}
                AND ${tables.scrobbles.timestamp} >= ${startDate.toISOString()}
                AND ${tables.scrobbles.timestamp} < ${endDate.toISOString()}
                AND ${tables.artists.name} != 'Various Artists'
            ) expanded
            WHERE genre IS NOT NULL AND genre != ''
            GROUP BY genre
            ORDER BY genre_count DESC
            LIMIT 5
          `,
        ),

        // Most active day
        ctx.db
          .select({
            date: sql<string>`DATE(${tables.scrobbles.timestamp})`,
            dayCount: count(tables.scrobbles.id).as("day_count"),
          })
          .from(tables.scrobbles)
          .where(userAndDate)
          .groupBy(sql`DATE(${tables.scrobbles.timestamp})`)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(1)
          .execute(),

        // Most active hour
        ctx.db
          .select({
            hour: sql<number>`EXTRACT(HOUR FROM ${tables.scrobbles.timestamp})`,
            hourCount: count(tables.scrobbles.id).as("hour_count"),
          })
          .from(tables.scrobbles)
          .where(userAndDate)
          .groupBy(sql`EXTRACT(HOUR FROM ${tables.scrobbles.timestamp})`)
          .orderBy(desc(sql`count(${tables.scrobbles.id})`))
          .limit(1)
          .execute(),

        // Scrobbles per month
        ctx.db
          .select({
            month: sql<number>`EXTRACT(MONTH FROM ${tables.scrobbles.timestamp})`,
            monthCount: count(tables.scrobbles.id).as("month_count"),
          })
          .from(tables.scrobbles)
          .where(userAndDate)
          .groupBy(sql`EXTRACT(MONTH FROM ${tables.scrobbles.timestamp})`)
          .orderBy(sql`EXTRACT(MONTH FROM ${tables.scrobbles.timestamp})`)
          .execute(),

        // First scrobble of year
        ctx.db
          .select({
            trackTitle: tables.tracks.title,
            artistName: tables.tracks.artist,
            timestamp: tables.scrobbles.timestamp,
          })
          .from(tables.scrobbles)
          .innerJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(userAndDate)
          .orderBy(tables.scrobbles.timestamp)
          .limit(1)
          .execute(),

        // Last scrobble of year
        ctx.db
          .select({
            trackTitle: tables.tracks.title,
            artistName: tables.tracks.artist,
            timestamp: tables.scrobbles.timestamp,
          })
          .from(tables.scrobbles)
          .innerJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(userAndDate)
          .orderBy(desc(tables.scrobbles.timestamp))
          .limit(1)
          .execute(),

        // All scrobbled days (for streak calculation)
        ctx.db
          .select({
            date: sql<string>`DATE(${tables.scrobbles.timestamp})`,
          })
          .from(tables.scrobbles)
          .where(userAndDate)
          .groupBy(sql`DATE(${tables.scrobbles.timestamp})`)
          .orderBy(sql`DATE(${tables.scrobbles.timestamp})`)
          .execute(),

        // New artists: artists whose earliest scrobble by this user is within this year
        ctx.db
          .select({
            n: sql<number>`count(distinct artist_id)`,
          })
          .from(
            ctx.db
              .select({
                artistId: tables.scrobbles.artistId,
                firstScrobble:
                  sql<string>`MIN(${tables.scrobbles.timestamp})`.as(
                    "first_scrobble",
                  ),
              })
              .from(tables.scrobbles)
              .where(eq(tables.scrobbles.userId, user.id))
              .groupBy(tables.scrobbles.artistId)
              .as("artist_first"),
          )
          .where(
            and(
              sql`first_scrobble >= ${startDate.toISOString()}`,
              sql`first_scrobble < ${endDate.toISOString()}`,
            ),
          )
          .execute(),
      ]);

      // Fetch track, artist, album details
      const trackIds = topTrackIds
        .map((r) => r.trackId)
        .filter((id): id is string => id !== null);
      const artistIds = topArtistIds
        .map((r) => r.artistId)
        .filter((id): id is string => id !== null);
      const albumIds = topAlbumIds
        .map((r) => r.albumId)
        .filter((id): id is string => id !== null);

      const [tracks, artists, albums] = await Promise.all([
        trackIds.length > 0
          ? ctx.db
              .select({
                id: tables.tracks.id,
                title: tables.tracks.title,
                artist: tables.tracks.artist,
                albumArt: tables.tracks.albumArt,
                uri: tables.tracks.uri,
                artistUri: tables.tracks.artistUri,
                albumUri: tables.tracks.albumUri,
              })
              .from(tables.tracks)
              .where(inArray(tables.tracks.id, trackIds))
              .execute()
          : Promise.resolve([]),
        artistIds.length > 0
          ? ctx.db
              .select({
                id: tables.artists.id,
                name: tables.artists.name,
                picture: tables.artists.picture,
                uri: tables.artists.uri,
              })
              .from(tables.artists)
              .where(inArray(tables.artists.id, artistIds))
              .execute()
          : Promise.resolve([]),
        albumIds.length > 0
          ? ctx.db
              .select({
                id: tables.albums.id,
                title: tables.albums.title,
                artist: tables.albums.artist,
                albumArt: tables.albums.albumArt,
                uri: tables.albums.uri,
              })
              .from(tables.albums)
              .where(inArray(tables.albums.id, albumIds))
              .execute()
          : Promise.resolve([]),
      ]);

      // Build lookup maps
      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      const artistMap = new Map(artists.map((a) => [a.id, a]));
      const albumMap = new Map(albums.map((a) => [a.id, a]));

      // Compute longest streak from daily data
      const longestStreak = computeLongestStreak(
        allDailyRows.map((r) => r.date),
      );

      return {
        year,
        totalScrobbles: Number(totalScrobblesRow[0]?.n ?? 0),
        totalListeningTimeMinutes: Math.floor(
          Number(totalTimeRow[0]?.total ?? 0) / 60,
        ),
        topTracks: topTrackIds
          .map((item) => {
            const t = trackMap.get(item.trackId!);
            if (!t) return null;
            return {
              id: t.id,
              title: t.title,
              artist: t.artist,
              albumArt: t.albumArt ?? undefined,
              uri: t.uri ?? undefined,
              artistUri: t.artistUri ?? undefined,
              albumUri: t.albumUri ?? undefined,
              playCount: Number(item.playCount),
            };
          })
          .filter(Boolean) as WrappedView["topTracks"],
        topArtists: topArtistIds
          .map((item) => {
            const a = artistMap.get(item.artistId!);
            if (!a) return null;
            return {
              id: a.id,
              name: a.name,
              picture: a.picture ?? undefined,
              uri: a.uri ?? undefined,
              playCount: Number(item.playCount),
            };
          })
          .filter(Boolean) as WrappedView["topArtists"],
        topAlbums: topAlbumIds
          .map((item) => {
            const a = albumMap.get(item.albumId!);
            if (!a) return null;
            return {
              id: a.id,
              title: a.title,
              artist: a.artist,
              albumArt: a.albumArt ?? undefined,
              uri: a.uri ?? undefined,
              playCount: Number(item.playCount),
            };
          })
          .filter(Boolean) as WrappedView["topAlbums"],
        topGenres: (
          topGenresRows as {
            rows: Array<{ genre: string; genre_count: string }>;
          }
        ).rows
          .filter((r) => r.genre)
          .map((r) => ({ genre: r.genre, count: Number(r.genre_count) })),
        mostActiveDay: mostActiveDayRow[0]
          ? {
              date: mostActiveDayRow[0].date,
              count: Number(mostActiveDayRow[0].dayCount),
            }
          : undefined,
        mostActiveHour: mostActiveHourRow[0]
          ? Number(mostActiveHourRow[0].hour)
          : undefined,
        newArtistsCount: Number(newArtistRows[0]?.n ?? 0),
        scrobblesPerMonth: scrobblesPerMonthRows.map((r) => ({
          month: Number(r.month),
          count: Number(r.monthCount),
        })),
        firstScrobble: firstScrobbleRow[0]
          ? {
              trackTitle: firstScrobbleRow[0].trackTitle,
              artistName: firstScrobbleRow[0].artistName,
              timestamp: firstScrobbleRow[0].timestamp.toISOString(),
            }
          : undefined,
        lastScrobble: lastScrobbleRow[0]
          ? {
              trackTitle: lastScrobbleRow[0].trackTitle,
              artistName: lastScrobbleRow[0].artistName,
              timestamp: lastScrobbleRow[0].timestamp.toISOString(),
            }
          : undefined,
        longestStreak,
      };
    },
    catch: (error) => new Error(`Failed to retrieve wrapped stats: ${error}`),
  });
};

function computeLongestStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

function defaultWrapped(year: number): WrappedView {
  return {
    year,
    totalScrobbles: 0,
    totalListeningTimeMinutes: 0,
    topArtists: [],
    topTracks: [],
    topAlbums: [],
    topGenres: [],
    mostActiveDay: undefined,
    mostActiveHour: undefined,
    newArtistsCount: 0,
    scrobblesPerMonth: [],
    firstScrobble: undefined,
    lastScrobble: undefined,
    longestStreak: 0,
  };
}
