import type { Context } from "context";
import { consola } from "consola";
import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  RecommendedAlbumView,
  RecommendedAlbumsView,
} from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/getAlbumRecommendations";
import tables from "schema";

const DECAY_LAMBDA = 0.02 as const;
const NEIGHBOUR_LIMIT = 50;
const RESULT_LIMIT = 50;

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

  const getAlbumRecommendations = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(cacheKey(params))),
      Effect.catchAll((err) => {
        consola.error("getAlbumRecommendations error:", err);
        return Effect.succeed({ albums: [] });
      }),
    );

  server.app.rocksky.feed.getAlbumRecommendations({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getAlbumRecommendations(params));
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

      // Albums the user has already heard.
      // scrobbles.albumId is nullable, so also collect album URIs via the
      // scrobbled tracks' albumUri field to cover the missing-albumId case.
      const [heardAlbumRows, heardAlbumUriRows] = await Promise.all([
        ctx.db
          .select({ albumId: tables.scrobbles.albumId })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.userId, user.id))
          .groupBy(tables.scrobbles.albumId),
        ctx.db
          .select({ albumUri: tables.tracks.albumUri })
          .from(tables.scrobbles)
          .innerJoin(
            tables.tracks,
            eq(tables.scrobbles.trackId, tables.tracks.id),
          )
          .where(eq(tables.scrobbles.userId, user.id))
          .groupBy(tables.tracks.albumUri),
      ]);

      const heardAlbumIds = heardAlbumRows
        .map((r) => r.albumId)
        .filter((id): id is string => id !== null);

      const heardAlbumUris = heardAlbumUriRows
        .map((r) => r.albumUri)
        .filter((u): u is string => u !== null);

      // Artists the user knows, with their scrobble counts as familiarity score
      const userArtistRows = await ctx.db
        .select({
          artistId: tables.userArtists.artistId,
          scrobbles: tables.userArtists.scrobbles,
        })
        .from(tables.userArtists)
        .where(eq(tables.userArtists.userId, user.id))
        .orderBy(desc(tables.userArtists.scrobbles))
        .limit(200);

      const heardArtistIds = userArtistRows.map((r) => r.artistId);
      const artistFamiliarityMap = new Map(
        userArtistRows.map((r) => [r.artistId, r.scrobbles ?? 0]),
      );

      // Build genre profile from scrobbled artists AND liked tracks' artists
      const lovedTrackIds = await ctx.db
        .select({ trackId: tables.lovedTracks.trackId })
        .from(tables.lovedTracks)
        .where(eq(tables.lovedTracks.userId, user.id))
        .then((rows) =>
          rows.map((r) => r.trackId).filter((id): id is string => id !== null),
        );

      // Scrobble-weighted genre profile — reuses artistFamiliarityMap for weights.
      // Genres below 5 % of total listening are excluded so incidentally-heard
      // genres don't pollute the profile.
      const [artistGenreRows, likedArtistGenres] = await Promise.all([
        heardArtistIds.length > 0
          ? ctx.db
              .select({ id: tables.artists.id, genres: tables.artists.genres })
              .from(tables.artists)
              .where(inArray(tables.artists.id, heardArtistIds))
          : Promise.resolve([] as { id: string; genres: string[] | null }[]),
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

      // Pool A — albums from known artists not yet heard
      // Resolve artist IDs → URIs to join against albums.artistUri
      const knownArtistData =
        heardArtistIds.length > 0
          ? await ctx.db
              .select({
                id: tables.artists.id,
                uri: tables.artists.uri,
                name: tables.artists.name,
              })
              .from(tables.artists)
              .where(inArray(tables.artists.id, heardArtistIds))
              .then((rows) =>
                rows.filter(
                  (r): r is { id: string; uri: string; name: string | null } =>
                    r.uri !== null &&
                    r.name?.toLowerCase() !== "various artists",
                ),
              )
          : [];

      const knownArtistUris = knownArtistData.map((r) => r.uri);
      // Map artist URI → artist ID so Pool A can look up familiarity scores correctly
      const uriToKnownArtistId = new Map(knownArtistData.map((r) => [r.uri, r.id]));

      const poolA: Candidate[] =
        knownArtistUris.length > 0
          ? await ctx.db
              .select({
                id: tables.albums.id,
                artistUri: tables.albums.artistUri,
              })
              .from(tables.albums)
              .where(
                and(
                  inArray(tables.albums.artistUri, knownArtistUris),
                  heardAlbumIds.length > 0
                    ? notInArray(tables.albums.id, heardAlbumIds)
                    : undefined,
                  heardAlbumUris.length > 0
                    ? notInArray(tables.albums.uri, heardAlbumUris)
                    : undefined,
                ),
              )
              .limit(500)
              .then((rows) =>
                rows.flatMap((row): Candidate[] => {
                  if (!row.artistUri) return [];
                  const artistId = uriToKnownArtistId.get(row.artistUri);
                  const score = artistId
                    ? (artistFamiliarityMap.get(artistId) ?? 1)
                    : 1;
                  return [
                    {
                      albumId: row.id,
                      score: Number(score),
                      source: "known-artist",
                    },
                  ];
                }),
              )
          : [];

      // Pool B — albums from artists neighbours love but user hasn't heard
      const neighbours =
        heardArtistIds.length > 0
          ? await ctx.db
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
              .limit(NEIGHBOUR_LIMIT)
          : [];

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

      const poolBAlreadyInA = new Set(poolA.map((c) => c.albumId));

      const poolB: Candidate[] =
        neighbourIds.length > 0
          ? await (async () => {
              // Neighbour artists the user hasn't heard
              const newArtistRows = await ctx.db
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
                .limit(150);

              // Score each new artist
              const artistScoreMap = new Map<string, number>();
              const heardArtistSet = new Set(heardArtistIds);
              for (const row of newArtistRows) {
                if (!row.artistId || !row.neighbourUserId) continue;
                if (heardArtistSet.has(row.artistId)) continue;
                const similarity = similarityMap.get(row.neighbourUserId) ?? 0;
                const score = similarity * Number(row.playScore);
                const existing = artistScoreMap.get(row.artistId) ?? 0;
                if (score > existing) artistScoreMap.set(row.artistId, score);
              }

              if (artistScoreMap.size === 0) return [];

              const newArtistIdList = [...artistScoreMap.keys()];

              // Resolve to URIs + genres, filtering by user genre profile and Various Artists
              const newArtistUris = await ctx.db
                .select({
                  id: tables.artists.id,
                  uri: tables.artists.uri,
                  name: tables.artists.name,
                  genres: tables.artists.genres,
                })
                .from(tables.artists)
                .where(inArray(tables.artists.id, newArtistIdList))
                .then((rows) =>
                  rows.filter(
                    (r): r is {
                      id: string;
                      uri: string;
                      name: string | null;
                      genres: string[] | null;
                    } =>
                      r.uri !== null &&
                      r.name?.toLowerCase() !== "various artists" &&
                      (userGenres.size === 0 ||
                        (r.genres ?? []).some((g) => userGenres.has(g))),
                    // When userGenres is empty (no genre profile yet), allow all.
                    // When non-empty, strictly require genre overlap.
                  ),
                );

              if (newArtistUris.length === 0) return [];

              // Albums by those genre-matching new artists
              const albums = await ctx.db
                .select({
                  id: tables.albums.id,
                  artistUri: tables.albums.artistUri,
                })
                .from(tables.albums)
                .where(
                  and(
                    inArray(
                      tables.albums.artistUri,
                      newArtistUris.map((a) => a.uri),
                    ),
                    heardAlbumIds.length > 0
                      ? notInArray(tables.albums.id, heardAlbumIds)
                      : undefined,
                    heardAlbumUris.length > 0
                      ? notInArray(tables.albums.uri, heardAlbumUris)
                      : undefined,
                  ),
                )
                .limit(500);

              const uriToArtistId = new Map(
                newArtistUris.map((a) => [a.uri, a.id]),
              );

              return albums
                .filter((a) => !poolBAlreadyInA.has(a.id) && a.artistUri)
                .map((a) => {
                  const artistId = uriToArtistId.get(a.artistUri!);
                  const score = artistId
                    ? (artistScoreMap.get(artistId) ?? 0)
                    : 0;
                  return {
                    albumId: a.id,
                    score,
                    source: "new-artist" as const,
                  };
                });
            })()
          : [];

      // Merge both pools, sort by score, take top N
      const merged = [...poolA, ...poolB].sort((a, b) => b.score - a.score);
      const seen = new Set<string>();
      const candidates = merged
        .filter((c) => {
          if (seen.has(c.albumId)) return false;
          seen.add(c.albumId);
          return true;
        })
        .slice(0, limit);

      return { candidates, userGenres, ctx };
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
      const albumIds = candidates
        .map((c) => c.albumId)
        .filter((id): id is string => id !== null);

      if (albumIds.length === 0) return { items: [] };

      const albumRows = await ctx.db
        .select({
          id: tables.albums.id,
          uri: tables.albums.uri,
          title: tables.albums.title,
          artist: tables.albums.artist,
          artistUri: tables.albums.artistUri,
          year: tables.albums.year,
          albumArt: tables.albums.albumArt,
        })
        .from(tables.albums)
        .where(inArray(tables.albums.id, albumIds));

      const albumMap = new Map(albumRows.map((a) => [a.id, a]));
      const scoreMap = new Map(candidates.map((c) => [c.albumId, c]));

      const items = albumIds
        .map((id) => {
          const album = albumMap.get(id);
          const candidate = scoreMap.get(id);
          if (!album || !candidate) return null;
          return { ...album, score: candidate.score, source: candidate.source };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        // Drop Various Artists compilations
        .filter((item) => item.artist?.toLowerCase() !== "various artists");

      return { items };
    },
    catch: (err) => new Error(`hydrate failed: ${err}`),
  });

const presentation = ({
  items,
}: HydrateResult): Effect.Effect<RecommendedAlbumsView, never> =>
  Effect.sync(() => ({
    albums: items.map(
      (item): RecommendedAlbumView => ({
        id: item.id,
        uri: item.uri ?? undefined,
        title: item.title,
        artist: item.artist,
        artistUri: item.artistUri ?? undefined,
        year: item.year ?? undefined,
        albumArt: item.albumArt ?? undefined,
        recommendationScore: item.score,
        source: item.source,
      }),
    ),
  }));

type Candidate = {
  albumId: string;
  score: number;
  source: "known-artist" | "new-artist" | "serendipity";
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
    title: string;
    artist: string;
    artistUri: string | null;
    year: number | null;
    albumArt: string | null;
    score: number;
    source: "known-artist" | "new-artist" | "serendipity";
  }[];
};
