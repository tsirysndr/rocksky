import type { Context } from "context";
import { consola } from "consola";
import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  RecommendationView,
  RecommendationsView,
} from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getRecommendations";
import tables from "schema";

const DECAY_LAMBDA = 0.02 as const;
const NEIGHBOUR_LIMIT = 50;
const RESULT_LIMIT = 50;
const SERENDIPITY_RATIO = 0.15;

// Stable string key — plain objects don't implement Effect's Equal so they
// always miss; a serialised string gets value-equality for free.
const cacheKey = (params: QueryParams) =>
  `${params.did}|${params.limit ?? RESULT_LIMIT}`;

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(5),
    lookup: (key: string) => {
      const sep = key.lastIndexOf("|");
      const params: QueryParams = {
        did: key.slice(0, sep),
        limit: Number(key.slice(sep + 1)),
      };
      return pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(hydrate),
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("30 seconds"),
      );
    },
  });

  const getRecommendations = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(cacheKey(params))),
      Effect.catchAll((err) => {
        consola.error("getRecommendations error:", err);
        return Effect.succeed({ recommendations: [] });
      }),
    );

  server.app.rocksky.feed.getRecommendations({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getRecommendations(params));
      return { encoding: "application/json", body: result };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<RetrieveResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .then((rows) => rows[0]);

      if (!user) throw new Error("User not found");

      const limit = Math.min(params.limit ?? RESULT_LIMIT, 100);
      const serendipityCount = Math.ceil(limit * SERENDIPITY_RATIO);
      const mainCount = limit - serendipityCount;

      // Tracks the user has already scrobbled
      const heardRows = await ctx.db
        .select({ trackId: tables.scrobbles.trackId })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.userId, user.id))
        .groupBy(tables.scrobbles.trackId);

      const heardIds = heardRows
        .map((r) => r.trackId)
        .filter((id): id is string => id !== null);

      // Tracks the user has already loved
      const lovedTrackIds = await ctx.db
        .select({ trackId: tables.lovedTracks.trackId })
        .from(tables.lovedTracks)
        .where(eq(tables.lovedTracks.userId, user.id))
        .then((rows) =>
          rows.map((r) => r.trackId).filter((id): id is string => id !== null),
        );

      // Combined exclusion set: scrobbled + loved tracks
      const heardSet = new Set([...heardIds, ...lovedTrackIds]);
      const excludedIds = [...heardSet];

      // User's artist profile with recency decay
      const artistProfile = await ctx.db
        .select({
          artistId: tables.scrobbles.artistId,
        })
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.userId, user.id))
        .groupBy(tables.scrobbles.artistId)
        .orderBy(
          desc(
            sql<number>`sum(exp(-0.02 * extract(epoch from (now() - ${tables.scrobbles.timestamp})) / 86400))`,
          ),
        )
        .limit(200);

      const artistIds = artistProfile
        .map((r) => r.artistId)
        .filter((id): id is string => id !== null);

      if (artistIds.length === 0) {
        return { candidates: [], serendipityCount, userGenres: new Set(), ctx };
      }

      // Build a scrobble-weighted genre profile.
      // Each genre accumulates the user's total listen count across all artists
      // that carry that genre. Genres below 5 % of total listening are excluded
      // so incidentally-heard genres (e.g. "a few K-pop tracks") don't pollute
      // the filter. Liked tracks receive a bonus weight as explicit endorsement.
      const [artistGenreRows, likedArtistGenres] = await Promise.all([
        ctx.db
          .select({
            genres: tables.artists.genres,
            scrobbles: tables.userArtists.scrobbles,
          })
          .from(tables.userArtists)
          .innerJoin(
            tables.artists,
            eq(tables.userArtists.artistId, tables.artists.id),
          )
          .where(eq(tables.userArtists.userId, user.id))
          .orderBy(desc(tables.userArtists.scrobbles))
          .limit(200),
        lovedTrackIds.length > 0
          ? ctx.db
              .select({ genres: tables.artists.genres })
              .from(tables.tracks)
              .leftJoin(
                tables.artists,
                eq(tables.tracks.artistUri, tables.artists.uri),
              )
              .where(inArray(tables.tracks.id, lovedTrackIds.slice(0, 200)))
              .then((rows) => rows.flatMap((r) => r.genres ?? []))
          : Promise.resolve([] as string[]),
      ]);

      const genreWeights = new Map<string, number>();
      for (const { genres, scrobbles } of artistGenreRows) {
        const w = Number(scrobbles ?? 1);
        for (const genre of genres ?? []) {
          genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + w);
        }
      }
      for (const genre of likedArtistGenres) {
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + 50);
      }

      const totalGenreWeight =
        [...genreWeights.values()].reduce((a, b) => a + b, 0) || 1;
      const userGenres = new Set<string>(
        [...genreWeights.entries()]
          .sort(([, a], [, b]) => b - a)
          .filter(([, w]) => w / totalGenreWeight >= 0.05)
          .slice(0, 10)
          .map(([g]) => g),
      );

      // Top neighbours by shared-artist overlap
      const neighbours = await ctx.db
        .select({
          userId: tables.scrobbles.userId,
          sharedCount: sql<number>`count(distinct ${tables.scrobbles.artistId})`,
        })
        .from(tables.scrobbles)
        .where(
          and(
            inArray(tables.scrobbles.artistId, artistIds),
            ne(tables.scrobbles.userId, user.id),
          ),
        )
        .groupBy(tables.scrobbles.userId)
        .orderBy(desc(sql`count(distinct ${tables.scrobbles.artistId})`))
        .limit(NEIGHBOUR_LIMIT);

      const neighbourIds = neighbours
        .map((n) => n.userId)
        .filter((id): id is string => id !== null);

      // similarity ∈ [0,1]: shared artists as fraction of the user's total artist count
      const similarityMap = new Map(
        neighbours.map((n) => [
          n.userId!,
          Number(n.sharedCount) / artistIds.length,
        ]),
      );

      if (neighbourIds.length === 0) {
        return { candidates: [], serendipityCount, userGenres, ctx };
      }

      // Tracks loved by neighbours — explicit 5× signal
      const lovedByNeighbours = await ctx.db
        .select({
          trackId: tables.lovedTracks.trackId,
          userId: tables.lovedTracks.userId,
        })
        .from(tables.lovedTracks)
        .where(
          and(
            inArray(tables.lovedTracks.userId, neighbourIds),
            excludedIds.length > 0
              ? notInArray(tables.lovedTracks.trackId, excludedIds)
              : undefined,
          ),
        );

      const lovedKey = (userId: string, trackId: string) =>
        `${userId}:${trackId}`;
      const lovedSet = new Set(
        lovedByNeighbours.map((l) => lovedKey(l.userId, l.trackId)),
      );

      // Candidate tracks from neighbour scrobbles, decay-weighted
      const neighbourTracks = await ctx.db
        .select({
          trackId: tables.scrobbles.trackId,
          neighbourUserId: tables.scrobbles.userId,
          playScore: sql<number>`sum(exp(-0.02 * extract(epoch from (now() - ${tables.scrobbles.timestamp})) / 86400))`,
        })
        .from(tables.scrobbles)
        .where(
          and(
            inArray(tables.scrobbles.userId, neighbourIds),
            excludedIds.length > 0
              ? notInArray(tables.scrobbles.trackId, excludedIds.slice(0, 500))
              : undefined,
          ),
        )
        .groupBy(tables.scrobbles.trackId, tables.scrobbles.userId)
        .orderBy(
          desc(
            sql`sum(exp(-0.02 * extract(epoch from (now() - ${tables.scrobbles.timestamp})) / 86400))`,
          ),
        )
        .limit(500);

      // Score = similarity × decayed_play_count × loved_boost
      const scoreMap = new Map<string, number>();
      const sourceMap = new Map<string, "neighbour" | "social">();

      for (const row of neighbourTracks) {
        if (!row.trackId || !row.neighbourUserId) continue;
        // Belt-and-suspenders: JS exclusion catches tracks beyond the SQL slice cap
        if (heardSet.has(row.trackId)) continue;
        const similarity = similarityMap.get(row.neighbourUserId) ?? 0;
        const isLoved = lovedSet.has(
          lovedKey(row.neighbourUserId, row.trackId),
        );
        const score = similarity * Number(row.playScore) * (isLoved ? 5 : 1);
        const existing = scoreMap.get(row.trackId) ?? 0;
        if (score > existing) {
          scoreMap.set(row.trackId, score);
          sourceMap.set(row.trackId, isLoved ? "social" : "neighbour");
        }
      }

      // Also include loved-but-not-scrobbled tracks from neighbours
      for (const l of lovedByNeighbours) {
        if (scoreMap.has(l.trackId)) continue;
        if (heardSet.has(l.trackId)) continue;
        const similarity = similarityMap.get(l.userId) ?? 0;
        scoreMap.set(l.trackId, similarity * 5);
        sourceMap.set(l.trackId, "social");
      }

      const mainCandidates = [...scoreMap.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, mainCount)
        .map(([trackId, score]) => ({
          trackId,
          score,
          source: sourceMap.get(trackId) ?? ("neighbour" as const),
        }));

      // Serendipity pool: tracks from artists the user hasn't heard,
      // discovered through neighbour artists (1-hop expansion from user's taste)
      const serendipityArtistIds = await ctx.db
        .select({ artistId: tables.scrobbles.artistId })
        .from(tables.scrobbles)
        .where(
          and(
            inArray(tables.scrobbles.userId, neighbourIds),
            notInArray(tables.scrobbles.artistId, artistIds),
          ),
        )
        .groupBy(tables.scrobbles.artistId)
        .orderBy(desc(sql`count(*)`))
        .limit(150)
        .then((rows) =>
          rows.map((r) => r.artistId).filter((id): id is string => id !== null),
        );

      // Enforce genre similarity: only serendipity artists that share at least one genre
      // with the user's taste profile, and skip Various Artists compilations
      const genreFilteredSerendipityArtistIds =
        serendipityArtistIds.length > 0
          ? await ctx.db
              .select({
                id: tables.artists.id,
                name: tables.artists.name,
                genres: tables.artists.genres,
              })
              .from(tables.artists)
              .where(inArray(tables.artists.id, serendipityArtistIds))
              .then((rows) =>
                rows
                  .filter(
                    (r) =>
                      r.name?.toLowerCase() !== "various artists" &&
                      (userGenres.size === 0 ||
                        (r.genres ?? []).some((g) => userGenres.has(g))),
                  )
                  .map((r) => r.id),
              )
          : [];

      const alreadyReturned = new Set(mainCandidates.map((c) => c.trackId));

      // Resolve artist IDs → artist URIs to join against tracks.artistUri
      const serendipityArtistUris =
        genreFilteredSerendipityArtistIds.length > 0
          ? await ctx.db
              .select({ uri: tables.artists.uri })
              .from(tables.artists)
              .where(
                inArray(tables.artists.id, genreFilteredSerendipityArtistIds),
              )
              .then((rows) =>
                rows.map((r) => r.uri).filter((u): u is string => u !== null),
              )
          : [];

      const serendipityTracks =
        serendipityArtistUris.length > 0
          ? await ctx.db
              .select({ id: tables.tracks.id })
              .from(tables.tracks)
              .where(
                and(
                  inArray(tables.tracks.artistUri, serendipityArtistUris),
                  excludedIds.length > 0
                    ? notInArray(tables.tracks.id, excludedIds)
                    : undefined,
                ),
              )
              .orderBy(sql`random()`)
              .limit(serendipityCount * 3)
              .then((rows) =>
                rows
                  .filter((r) => !alreadyReturned.has(r.id))
                  .slice(0, serendipityCount)
                  .map((r) => ({
                    trackId: r.id,
                    score: 0,
                    source: "serendipity" as const,
                  })),
              )
          : [];

      return {
        candidates: [...mainCandidates, ...serendipityTracks],
        serendipityCount,
        userGenres,
        ctx,
      };
    },
    catch: (err) => new Error(`retrieve failed: ${err}`),
  });

const hydrate = ({
  candidates,
  userGenres,
  ctx,
}: RetrieveResult): Effect.Effect<HydrateResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      const trackIds = candidates
        .map((c) => c.trackId)
        .filter((id): id is string => id !== null);

      if (trackIds.length === 0) return { items: [] };

      const [trackRows, likeRows] = await Promise.all([
        ctx.db
          .select({
            id: tables.tracks.id,
            title: tables.tracks.title,
            artist: tables.tracks.artist,
            album: tables.tracks.album,
            albumArt: tables.tracks.albumArt,
            trackUri: tables.tracks.uri,
            artistUri: tables.artists.uri,
            albumUri: tables.albums.uri,
            genres: tables.artists.genres,
          })
          .from(tables.tracks)
          .leftJoin(
            tables.artists,
            eq(tables.tracks.artistUri, tables.artists.uri),
          )
          .leftJoin(
            tables.albums,
            eq(tables.tracks.albumUri, tables.albums.uri),
          )
          .where(inArray(tables.tracks.id, trackIds)),
        ctx.db
          .select({
            trackId: tables.lovedTracks.trackId,
            count: sql<number>`count(*)`,
          })
          .from(tables.lovedTracks)
          .where(inArray(tables.lovedTracks.trackId, trackIds))
          .groupBy(tables.lovedTracks.trackId),
      ]);

      const trackMap = new Map(trackRows.map((r) => [r.id, r]));
      const likeMap = new Map(
        likeRows.map((r) => [r.trackId, Number(r.count)]),
      );

      const scoreMap = new Map(candidates.map((c) => [c.trackId, c]));

      const items = trackIds
        .map((id) => {
          const track = trackMap.get(id);
          const candidate = scoreMap.get(id);
          if (!track || !candidate) return null;
          return {
            ...track,
            score: candidate.score,
            source: candidate.source,
            likesCount: likeMap.get(id) ?? 0,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        // Drop Various Artists compilations
        .filter((item) => item.artist?.toLowerCase() !== "various artists");

      // Strict genre filter using artists.genres only (authoritative source).
      // Tracks with no artist genre data are excluded — they cannot be verified
      // as matching the user's taste.
      const genreFiltered =
        userGenres.size > 0
          ? items.filter((item) =>
              (item.genres ?? []).some((g) => userGenres.has(g)),
            )
          : items;

      return { items: genreFiltered };
    },
    catch: (err) => new Error(`hydrate failed: ${err}`),
  });

const presentation = ({
  items,
}: HydrateResult): Effect.Effect<RecommendationsView, never> =>
  Effect.sync(() => ({
    recommendations: items.map(
      (item): RecommendationView => ({
        title: item.title ?? undefined,
        artist: item.artist ?? undefined,
        album: item.album ?? undefined,
        albumArt: item.albumArt ?? undefined,
        trackUri: item.trackUri ?? undefined,
        artistUri: item.artistUri ?? undefined,
        albumUri: item.albumUri ?? undefined,
        genres: item.genres ?? [],
        recommendationScore: item.score,
        source: item.source,
        likesCount: item.likesCount,
      }),
    ),
  }));

type Candidate = {
  trackId: string;
  score: number;
  source: "neighbour" | "social" | "serendipity";
};

type RetrieveResult = {
  candidates: Candidate[];
  serendipityCount: number;
  userGenres: Set<string>;
  ctx: Context;
};

type HydrateResult = {
  items: {
    id: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    albumArt: string | null;
    trackUri: string | null;
    artistUri: string | null;
    albumUri: string | null;
    genres: string[] | null; // from artists.genres — authoritative
    score: number;
    source: "neighbour" | "social" | "serendipity";
    likesCount: number;
  }[];
};
