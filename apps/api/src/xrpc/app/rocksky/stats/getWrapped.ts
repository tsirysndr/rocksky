import { consola } from "consola";
import type { Context } from "context";
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { WrappedView } from "lexicon/types/app/rocksky/stats/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/stats/getWrapped";
import { transientDbRetry } from "lib/dbRetry";
import { queryCache } from "lib/queryCache";
import tables from "schema";
import { wrappedSummaryQuery, type WrappedSummary } from "./wrappedQuery";

export default function (server: Server, ctx: Context) {
  const cached = queryCache(
    (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
    "30 minutes",
  );

  const getWrapped = (params: QueryParams) => {
    const year = params.year ?? new Date().getFullYear();
    const period = normalizePeriod(params.period);
    return pipe(
      cached({
        did: params.did,
        year: period === "year" ? year : undefined,
        period,
      }),
      Effect.catchAll((err) => {
        consola.error(err);
        const { startDate, endDate } = periodWindow(period, year);
        return Effect.succeed(defaultWrapped(year, period, startDate, endDate));
      }),
    );
  };

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
      const period = normalizePeriod(params.period);
      const { year, startDate, endDate } = periodWindow(period, params.year);

      const user = await ctx.readDb
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

      if (!user) return defaultWrapped(year, period, startDate, endDate);

      const dateConditions = [
        gte(tables.scrobbles.timestamp, startDate),
        lt(tables.scrobbles.timestamp, endDate),
      ];
      const userAndDate = and(
        eq(tables.scrobbles.userId, user.id),
        ...dateConditions,
      );

      const [summaryResult, firstScrobbleRow, lastScrobbleRow] =
        await Promise.all([
          ctx.readDb.execute(wrappedSummaryQuery(user.id, startDate, endDate)),
          // First scrobble of year
          ctx.readDb
            .select({
              trackTitle: tables.tracks.title,
              artistName: tables.tracks.artist,
              timestamp: tables.scrobbles.timestamp,
              trackUri: tables.tracks.uri,
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
          ctx.readDb
            .select({
              trackTitle: tables.tracks.title,
              artistName: tables.tracks.artist,
              timestamp: tables.scrobbles.timestamp,
              trackUri: tables.tracks.uri,
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
        ]);
      const summary = summaryResult.rows[0] as unknown as WrappedSummary;
      const { topTrackIds, topArtistIds, topAlbumIds } = summary;
      const allDailyRows = summary.daily;
      const mostActiveDayRow = [...allDailyRows]
        .sort((a, b) => b.dayCount - a.dayCount)
        .slice(0, 1);
      const mostActiveHourRow = summary.hours;
      const scrobblesPerMonthRows = summary.months;

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
          ? ctx.readDb
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
          ? ctx.readDb
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
          ? ctx.readDb
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
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalScrobbles: Number(summary.totalScrobbles),
        totalListeningTimeMinutes: Math.floor(
          Number(summary.totalTime) / 60_000,
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
        topGenres: summary.topGenres
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
        newArtistsCount: Number(summary.newArtistsCount),
        scrobblesPerMonth: scrobblesPerMonthRows.map((r) => ({
          month: Number(r.month),
          count: Number(r.monthCount),
        })),
        scrobblesPerDay: allDailyRows.map((r) => ({
          date: r.date,
          count: Number(r.dayCount),
        })),
        firstScrobble: firstScrobbleRow[0]
          ? {
              trackTitle: firstScrobbleRow[0].trackTitle,
              artistName: firstScrobbleRow[0].artistName,
              timestamp: firstScrobbleRow[0].timestamp.toISOString(),
              trackUri: firstScrobbleRow[0].trackUri ?? undefined,
            }
          : undefined,
        lastScrobble: lastScrobbleRow[0]
          ? {
              trackTitle: lastScrobbleRow[0].trackTitle,
              artistName: lastScrobbleRow[0].artistName,
              timestamp: lastScrobbleRow[0].timestamp.toISOString(),
              trackUri: lastScrobbleRow[0].trackUri ?? undefined,
            }
          : undefined,
        longestStreak,
      };
    },
    catch: (error) => new Error(`Failed to retrieve wrapped stats: ${error}`),
  });
};

const PERIODS = ["year", "3months", "month", "2weeks", "week"] as const;
type Period = (typeof PERIODS)[number];

function normalizePeriod(period?: string): Period {
  return PERIODS.find((p) => p === period) ?? "year";
}

/** A calendar year, or a rolling window ending now for the shorter periods. */
function periodWindow(
  period: Period,
  year = new Date().getFullYear(),
): { year: number; startDate: Date; endDate: Date } {
  if (period === "year") {
    return {
      year,
      startDate: new Date(`${year}-01-01T00:00:00.000Z`),
      endDate: new Date(`${year + 1}-01-01T00:00:00.000Z`),
    };
  }
  const endDate = new Date();
  const startDate = new Date(endDate);
  switch (period) {
    case "3months":
      startDate.setUTCMonth(startDate.getUTCMonth() - 3);
      break;
    case "month":
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      break;
    case "2weeks":
      startDate.setUTCDate(startDate.getUTCDate() - 14);
      break;
    case "week":
      startDate.setUTCDate(startDate.getUTCDate() - 7);
      break;
  }
  return { year: endDate.getUTCFullYear(), startDate, endDate };
}

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

function defaultWrapped(
  year: number,
  period: Period = "year",
  startDate?: Date,
  endDate?: Date,
): WrappedView {
  return {
    year,
    period,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
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
    scrobblesPerDay: [],
    firstScrobble: undefined,
    lastScrobble: undefined,
    longestStreak: 0,
  };
}
