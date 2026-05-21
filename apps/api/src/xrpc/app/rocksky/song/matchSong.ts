import type { Context } from "context";
import { consola } from "consola";
import { and, count, eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/matchSong";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";
import type {
  Album,
  Artist,
  MusicBrainzArtist,
  SearchResponse,
  Track,
} from "./types";
import type { MusicbrainzTrack } from "types/track";

const MATCH_SONG_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const getCacheKey = (params: QueryParams): string => {
  if (params.mbId) return `matchSong:mbId:${params.mbId}`;
  return `matchSong:${params.title.toLowerCase()}:${params.artist.toLowerCase()}`;
};

export default function (server: Server, ctx: Context) {
  const matchSong = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.song.matchSong({
    handler: async ({ params }) => {
      const cacheKey = getCacheKey(params);

      const cached = await ctx.redis.get(cacheKey);
      if (cached) {
        return {
          encoding: "application/json",
          body: JSON.parse(cached),
        };
      }

      const result = await Effect.runPromise(matchSong(params));

      if (result && Object.keys(result).length > 0) {
        await ctx.redis.set(cacheKey, JSON.stringify(result), {
          EX: MATCH_SONG_CACHE_TTL_SECONDS,
        });
      }

      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {
      const queryRecord = (
        whereCondition: Parameters<typeof ctx.db.select>[0] extends undefined
          ? never
          : ReturnType<typeof or>,
      ) =>
        ctx.db
          .select()
          .from(tables.tracks)
          .leftJoin(
            tables.albumTracks,
            eq(tables.albumTracks.trackId, tables.tracks.id),
          )
          .leftJoin(
            tables.albums,
            eq(tables.albumTracks.albumId, tables.albums.id),
          )
          .leftJoin(
            tables.artistAlbums,
            eq(tables.artistAlbums.albumId, tables.albums.id),
          )
          .leftJoin(
            tables.artists,
            eq(tables.artistAlbums.artistId, tables.artists.id),
          )
          .where(whereCondition)
          .execute()
          .then(([row]) => row);

      const byTitleArtist = or(
        and(
          sql`LOWER(${tables.tracks.title}) = LOWER(${params.title})`,
          sql`LOWER(${tables.tracks.artist}) = LOWER(${params.artist})`,
        ),
        and(
          sql`LOWER(${tables.tracks.title}) = LOWER(${params.title})`,
          sql`LOWER(${tables.tracks.albumArtist}) = LOWER(${params.artist})`,
        ),
      );

      let record = params.mbId
        ? await queryRecord(eq(tables.tracks.mbId, params.mbId))
        : null;

      if (!record) {
        record = await queryRecord(byTitleArtist);
      }

      let track = record?.tracks;

      let releaseDate = null,
        year = null,
        artistPicture = null,
        genres = null,
        mbArtists: MusicBrainzArtist[] | null = null;

      // Skip Spotify if record is found and album art is already present
      const needsSpotify = !record || !track?.albumArt;
      const spotifyTrack = needsSpotify
        ? await searchOnSpotify(ctx, params.title, params.artist)
        : undefined;

      if (!record) {
        if (params.mbId) {
          try {
            const { data: mbData } =
              await ctx.musicbrainz.get<MusicbrainzTrack>(
                `/recording/${params.mbId}`,
              );
            if (mbData?.trackMBID) {
              track = {
                id: "",
                title: mbData.name,
                artist: mbData.artist.map((a) => a.name).join(", "),
                albumArtist: mbData.artist[0]?.name ?? null,
                albumArt: spotifyTrack?.album.images[0]?.url ?? null,
                album: mbData.album,
                trackNumber: null,
                duration: 0,
                mbId: mbData.trackMBID,
                genre: null,
                youtubeLink: null,
                spotifyLink: spotifyTrack?.external_urls.spotify ?? null,
                appleMusicLink: null,
                tidalLink: null,
                sha256: null,
                discNumber: null,
                lyrics: null,
                composer: null,
                label: null,
                copyrightMessage: null,
                uri: null,
                albumUri: null,
                artistUri: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                xataVersion: 0,
              };
              mbArtists =
                mbData.artist?.map((a) => ({ mbid: a.mbid, name: a.name })) ??
                null;
              artistPicture =
                spotifyTrack?.artists[0]?.images?.[0]?.url ?? null;
              genres = spotifyTrack?.artists[0]?.genres ?? null;
            }
          } catch (error) {
            consola.error(
              "Error fetching MusicBrainz recording by mbId:",
              error,
            );
          }
        }

        if (!track && spotifyTrack) {
          track = {
            id: "",
            title: spotifyTrack.name,
            artist: spotifyTrack.artists
              .map((artist) => artist.name)
              .join(", "),
            albumArtist: spotifyTrack.album.artists[0]?.name,
            albumArt: spotifyTrack.album.images[0]?.url || null,
            album: spotifyTrack.album.name,
            trackNumber: spotifyTrack.track_number,
            duration: spotifyTrack.duration_ms,
            mbId: null,
            genre: null,
            youtubeLink: null,
            spotifyLink: spotifyTrack.external_urls.spotify,
            appleMusicLink: null,
            tidalLink: null,
            sha256: null,
            discNumber: spotifyTrack.disc_number,
            lyrics: null,
            composer: null,
            label: spotifyTrack.album.label || null,
            copyrightMessage: spotifyTrack.album.copyrights?.[0]?.text || null,
            uri: null,
            albumUri: null,
            artistUri: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            xataVersion: 0,
          };

          if (spotifyTrack.album.release_date_precision == "day") {
            releaseDate = spotifyTrack.album.release_date;
            year = parseInt(spotifyTrack.album.release_date.split("-")[0]);
          }

          if (spotifyTrack.album.release_date_precision == "year") {
            releaseDate = `${spotifyTrack.album.release_date}-01-01`;
            year = parseInt(spotifyTrack.album.release_date);
          }

          artistPicture = spotifyTrack.artists[0]?.images?.[0]?.url || null;
          genres = spotifyTrack.artists[0]?.genres || null;
        }
      } else {
        artistPicture = record.artists.picture;
        genres = record.artists.genres;
        releaseDate = record.albums.releaseDate;
        year = record.albums.year;

        if (!track?.albumArt && spotifyTrack) {
          track.albumArt = spotifyTrack.album.images[0]?.url || null;
        }
      }

      if (track && !track.mbId) {
        try {
          const mbTrack = await searchOnMusicBrainz(ctx, track, params.mbId);
          track.mbId = mbTrack.mbId;
          mbArtists = mbTrack.artists;
        } catch (error) {
          consola.error("Error fetching MusicBrainz data, continuing:", error);
        }
      }

      return Promise.all([
        Promise.resolve(track),
        ctx.db
          .select({
            count: count(),
          })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        Promise.resolve(releaseDate),
        Promise.resolve(year),
        Promise.resolve(artistPicture),
        Promise.resolve(genres),
        Promise.resolve(mbArtists),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve artist: ${error}`),
  });
};

const presentation = ([
  track,
  uniqueListeners,
  playCount,
  releaseDate,
  year,
  artistPicture,
  genres,
  mbArtists,
]: [
  SelectTrack,
  number,
  number,
  string | null,
  number | null,
  string | null,
  string[] | null,
  MusicBrainzArtist[] | null,
]): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    releaseDate,
    year,
    artistPicture,
    genres,
    mbArtists,
    playCount,
    uniqueListeners,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }));
};

const MAX_SPOTIFY_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const SPOTIFY_TIMEOUT_MS = 30000;

const retrySpotifyCall = async <T>(
  fn: () => Promise<T>,
  operation: string,
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_SPOTIFY_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        SPOTIFY_TIMEOUT_MS,
      );

      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new Error("Request timeout")),
          );
        }),
      ]);

      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isTimeout =
        errorMessage.includes("timeout") ||
        errorMessage.includes("timed out") ||
        errorMessage.includes("operation timed out") ||
        errorMessage.includes("ETIMEDOUT");

      if (isTimeout && attempt < MAX_SPOTIFY_RETRIES - 1) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
        consola.warn(
          `Spotify API timeout, retrying... attempt=${attempt + 1}, max_attempts=${MAX_SPOTIFY_RETRIES}, delay_ms=${delay}, operation=${operation}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = error instanceof Error ? error : new Error(String(error));
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
};

const searchOnSpotify = async (
  ctx: Context,
  title: string,
  artist: string,
): Promise<Track | undefined> => {
  const spotifyTokens = await ctx.db
    .select()
    .from(tables.spotifyTokens)
    .leftJoin(
      tables.spotifyApps,
      eq(tables.spotifyApps.spotifyAppId, tables.spotifyTokens.spotifyAppId),
    )
    .leftJoin(
      tables.spotifyAccounts,
      eq(tables.spotifyAccounts.userId, tables.spotifyTokens.userId),
    )
    .where(eq(tables.spotifyAccounts.isBetaUser, true))
    .limit(500)
    .execute();

  if (!spotifyTokens || spotifyTokens.length === 0) {
    consola.warn("No Spotify tokens available for beta users");
    return undefined;
  }

  const { spotify_tokens, spotify_apps } =
    spotifyTokens[Math.floor(Math.random() * spotifyTokens.length)];

  if (!spotify_tokens || !spotify_apps) {
    consola.warn("Invalid Spotify token or app data");
    return undefined;
  }

  const refreshToken = decrypt(
    spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
  );

  // get new access token
  const newAccessToken = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  if (!newAccessToken.ok) {
    consola.warn(
      `Spotify token refresh failed (${newAccessToken.status}), skipping`,
    );
    return undefined;
  }

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  let q = `q=track:"${encodeURIComponent(title)}"%20artist:"${encodeURIComponent(artist)}"&type=track`;

  if (artist.includes(", ")) {
    const artists = artist
      .split(", ")
      .map((a) => `artist:"${encodeURIComponent(a.trim())}"`)
      .join(" ");
    q = `q=track:"${encodeURIComponent(title)}" ${artists}&type=track`;
  }

  if (artist.includes(" x ")) {
    const artists = artist
      .split(" x ")
      .map((a) => `artist:"${encodeURIComponent(a.trim())}"`)
      .join(" ");
    q = `q=track:"${encodeURIComponent(title)}" ${artists}&type=track`;
  }

  const response = await retrySpotifyCall(
    async () =>
      fetch(`https://api.spotify.com/v1/search?${q}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }).then((res) => {
        if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
        return res.json<SearchResponse>();
      }),
    "search",
  );

  const track = response.tracks?.items?.[0];

  if (track) {
    const normalize = (s: string): string => {
      return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/á|à|ä|â|ã|å/g, "a")
        .replace(/é|è|ë|ê/g, "e")
        .replace(/í|ì|ï|î/g, "i")
        .replace(/ó|ò|ö|ô|õ/g, "o")
        .replace(/ú|ù|ü|û/g, "u")
        .replace(/ñ/g, "n")
        .replace(/ç/g, "c");
    };

    const spotifyArtists = track.artists.map((a) => normalize(a.name));

    // Check if artists don't contain the scrobble artist (to avoid wrong matches)
    // scrobble artist can contain multiple artists separated by ", "
    const scrobbleArtists = artist.split(", ").map((a) => normalize(a.trim()));

    // Check for matches with partial matching:
    // 1. Check if any scrobble artist is contained in any Spotify artist
    // 2. Check if any Spotify artist is contained in any scrobble artist
    const hasArtistMatch = scrobbleArtists.some((scrobbleArtist) =>
      spotifyArtists.some(
        (spotifyArtist) =>
          scrobbleArtist.includes(spotifyArtist) ||
          spotifyArtist.includes(scrobbleArtist),
      ),
    );

    if (!hasArtistMatch) {
      consola.warn(
        `Artist mismatch, skipping - expected: ${artist}, got: ${track.artists.map((a) => a.name).join(", ")}`,
      );
      return undefined;
    }

    const album = await retrySpotifyCall(
      async () =>
        fetch(`https://api.spotify.com/v1/albums/${track.album.id}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }).then((res) => {
          if (!res.ok)
            throw new Error(`Spotify get_album failed: ${res.status}`);
          return res.json<Album>();
        }),
      "get_album",
    );

    track.album = album;

    const fetchedArtist = await retrySpotifyCall(
      async () =>
        fetch(`https://api.spotify.com/v1/artists/${track.artists[0].id}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }).then((res) => {
          if (!res.ok)
            throw new Error(`Spotify get_artist failed: ${res.status}`);
          return res.json<Artist>();
        }),
      "get_artist",
    );

    track.artists[0] = fetchedArtist;
  }

  return track;
};

const searchOnMusicBrainz = async (
  ctx: Context,
  track: SelectTrack,
  inputMbId?: string,
) => {
  let mbTrack;
  try {
    if (inputMbId) {
      const { data } = await ctx.musicbrainz.get<MusicbrainzTrack>(
        `/recording/${inputMbId}`,
      );
      mbTrack = data;
    } else {
      const { data } = await ctx.musicbrainz.post<MusicbrainzTrack>(
        "/hydrate",
        {
          artist: track.artist
            .replaceAll(";", ",")
            .split(",")
            .map((a) => ({ name: a.trim() })),
          name: track.title,
          album: track.album,
        },
      );
      mbTrack = data;

      if (!mbTrack?.trackMBID) {
        const response = await ctx.musicbrainz.post<MusicbrainzTrack>(
          "/hydrate",
          {
            artist: track.artist.split(",").map((a) => ({ name: a.trim() })),
            name: track.title,
          },
        );
        mbTrack = response.data;
      }
    }

    const mbId = mbTrack?.trackMBID;
    const artists: MusicBrainzArtist[] = mbTrack?.artist?.map((artist) => ({
      mbid: artist.mbid,
      name: artist.name,
    }));

    return {
      mbId,
      artists,
    };
  } catch (error) {
    consola.error("Error fetching MusicBrainz data");
  }

  return {
    mbId: null,
    artists: null,
  };
};
