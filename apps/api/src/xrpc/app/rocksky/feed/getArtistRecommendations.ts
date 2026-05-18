import type { Context } from "context";
import { consola } from "consola";
import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  RecommendedArtistView,
  RecommendedArtistsView,
} from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getArtistRecommendations";
import tables from "schema";

const DECAY_LAMBDA = 0.02 as const;
const NEIGHBOUR_LIMIT = 50;
const RESULT_LIMIT = 50;
const SERENDIPITY_RATIO = 0.15;

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

  const getArtistRecommendations = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(cacheKey(params))),
      Effect.catchAll((err) => {
        consola.error("getArtistRecommendations error:", err);
        return Effect.succeed({ artists: [] });
      }),
    );

  server.app.rocksky.feed.getArtistRecommendations({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistRecommendations(params));
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

      // Artists the user has already heard (with scrobble counts for genre weighting)
      const heardRows = await ctx.db
        .select({
          artistId: tables.userArtists.artistId,
          scrobbles: tables.userArtists.scrobbles,
        })
        .from(tables.userArtists)
        .where(eq(tables.userArtists.userId, user.id));

      const heardArtistIds = heardRows.map((r) => r.artistId);
      const heardArtistSet = new Set(heardArtistIds);
      const artistFamiliarityMap = new Map(
        heardRows.map((r) => [r.artistId, r.scrobbles ?? 1]),
      );

      if (heardArtistIds.length === 0) {
        return { candidates: [], userGenres: new Set(), ctx };
      }

      // Build genre profile from scrobbled artists AND liked tracks' artists
      const lovedTrackIds = await ctx.db
        .select({ trackId: tables.lovedTracks.trackId })
        .from(tables.lovedTracks)
        .where(eq(tables.lovedTracks.userId, user.id))
        .then((rows) =>
          rows.map((r) => r.trackId).filter((id): id is string => id !== null),
        );

      // Scrobble-weighted genre profile — reuses the already-fetched
      // heardArtistIds / artistFamiliarityMap; genres below 5 % of total
      // listening are excluded so incidentally-heard genres don't pollute it.
      const [artistGenreRows, likedArtistGenres] = await Promise.all([
        ctx.db
          .select({ id: tables.artists.id, genres: tables.artists.genres })
          .from(tables.artists)
          .where(inArray(tables.artists.id, heardArtistIds)),
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
      for (const { id, genres } of artistGenreRows) {
        const w = Number(artistFamiliarityMap.get(id) ?? 1);
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
            inArray(tables.scrobbles.artistId, heardArtistIds),
            ne(tables.scrobbles.userId, user.id),
          ),
        )
        .groupBy(tables.scrobbles.userId)
        .orderBy(desc(sql`count(distinct ${tables.scrobbles.artistId})`))
        .limit(NEIGHBOUR_LIMIT);

      const neighbourIds = neighbours
        .map((n) => n.userId)
        .filter((id): id is string => id !== null);

      const similarityMap = new Map(
        neighbours.map((n) => [
          n.userId!,
          heardArtistIds.length > 0
            ? Number(n.sharedCount) / heardArtistIds.length
            : 0,
        ]),
      );

      if (neighbourIds.length === 0) {
        return { candidates: [], userGenres, ctx };
      }

      // Artists scrobbled by neighbours but not yet heard by the user
      const neighbourArtists = await ctx.db
        .select({
          artistId: tables.scrobbles.artistId,
          neighbourUserId: tables.scrobbles.userId,
          playScore: sql<number>`sum(exp(-0.02 * extract(epoch from (now() - ${tables.scrobbles.timestamp})) / 86400))`,
        })
        .from(tables.scrobbles)
        .where(
          and(
            inArray(tables.scrobbles.userId, neighbourIds),
            heardArtistIds.length > 0
              ? notInArray(
                  tables.scrobbles.artistId,
                  heardArtistIds.slice(0, 500),
                )
              : undefined,
          ),
        )
        .groupBy(tables.scrobbles.artistId, tables.scrobbles.userId)
        .orderBy(
          desc(
            sql`sum(exp(-0.02 * extract(epoch from (now() - ${tables.scrobbles.timestamp})) / 86400))`,
          ),
        )
        .limit(500);

      // Score = similarity × decayed_play_count
      const scoreMap = new Map<string, number>();

      for (const row of neighbourArtists) {
        if (!row.artistId || !row.neighbourUserId) continue;
        // Belt-and-suspenders: JS check catches artists beyond the SQL slice cap
        if (heardArtistSet.has(row.artistId)) continue;
        const similarity = similarityMap.get(row.neighbourUserId) ?? 0;
        const score = similarity * Number(row.playScore);
        const existing = scoreMap.get(row.artistId) ?? 0;
        if (score > existing) {
          scoreMap.set(row.artistId, score);
        }
      }

      // Genre-filter the score pool BEFORE candidate selection so source labels
      // ("neighbour", "serendipity") are only ever assigned to genre-appropriate
      // artists. The hydrate filter is a secondary safety net.
      if (userGenres.size > 0 && scoreMap.size > 0) {
        const artistGenreData = await ctx.db
          .select({
            id: tables.artists.id,
            name: tables.artists.name,
            genres: tables.artists.genres,
          })
          .from(tables.artists)
          .where(inArray(tables.artists.id, [...scoreMap.keys()]));

        const genreOkIds = new Set(
          artistGenreData
            .filter(
              (r) =>
                r.name?.toLowerCase() !== "various artists" &&
                (r.genres ?? []).some((g) => userGenres.has(g)),
            )
            .map((r) => r.id),
        );

        for (const artistId of [...scoreMap.keys()]) {
          if (!genreOkIds.has(artistId)) scoreMap.delete(artistId);
        }
      }

      const alreadyReturned = new Set<string>();

      const mainCandidates = [...scoreMap.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, mainCount)
        .map(([artistId, score]) => {
          alreadyReturned.add(artistId);
          return { artistId, score, source: "neighbour" as const };
        });

      // Serendipity: lower-scored candidates from the tail of the scored pool
      const serendipityCandidates = [...scoreMap.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(mainCount, mainCount + serendipityCount * 3)
        .filter(([id]) => !alreadyReturned.has(id))
        .slice(0, serendipityCount)
        .map(([artistId, score]) => ({
          artistId,
          score,
          source: "serendipity" as const,
        }));

      return {
        candidates: [...mainCandidates, ...serendipityCandidates],
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
      const artistIds = candidates
        .map((c) => c.artistId)
        .filter((id): id is string => id !== null);

      if (artistIds.length === 0) return { items: [] };

      const artistRows = await ctx.db
        .select({
          id: tables.artists.id,
          uri: tables.artists.uri,
          name: tables.artists.name,
          picture: tables.artists.picture,
          genres: tables.artists.genres,
        })
        .from(tables.artists)
        .where(inArray(tables.artists.id, artistIds));

      const artistMap = new Map(artistRows.map((a) => [a.id, a]));
      const scoreMap = new Map(candidates.map((c) => [c.artistId, c]));

      const items = artistIds
        .map((id) => {
          const artist = artistMap.get(id);
          const candidate = scoreMap.get(id);
          if (!artist || !candidate) return null;
          return {
            ...artist,
            score: candidate.score,
            source: candidate.source,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        // Drop Various Artists compilations
        .filter((item) => item.name?.toLowerCase() !== "various artists");

      // Strict genre filter using artists.genres only (authoritative source).
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
}: HydrateResult): Effect.Effect<RecommendedArtistsView, never> =>
  Effect.sync(() => ({
    artists: items.map(
      (item): RecommendedArtistView => ({
        id: item.id,
        uri: item.uri ?? undefined,
        name: item.name,
        picture: item.picture ?? undefined,
        genres: item.genres ?? [],
        recommendationScore: item.score,
        source: item.source,
      }),
    ),
  }));

type Candidate = {
  artistId: string;
  score: number;
  source: "neighbour" | "serendipity";
};

type RetrieveResult = {
  candidates: Candidate[];
  userGenres: Set<string>;
  ctx: Context;
};

type HydrateResult = {
  items: {
    id: string;
    uri: string | null;
    name: string;
    picture: string | null;
    genres: string[] | null;
    score: number;
    source: "neighbour" | "serendipity";
  }[];
};
