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
  DeezerEnrichResponse,
  DeezerMatch,
  MusicBrainzArtist,
  SearchResponse,
  Track,
} from "./types";
import type { MusicbrainzTrack } from "types/track";

const MATCH_SONG_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const getCacheKey = (params: QueryParams): string => {
  if (params.mbId) return `matchSong:mbId:${params.mbId}`;
  if (params.isrc) return `matchSong:isrc:${params.isrc}`;
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

      if (!record && params.isrc) {
        record = await queryRecord(eq(tables.tracks.isrc, params.isrc));
      }

      if (!record) {
        record = await queryRecord(byTitleArtist);
      }

      let track = record?.tracks;

      let releaseDate = null,
        year = null,
        artistPicture = null,
        genres = null,
        mbArtists: MusicBrainzArtist[] | null = null;
      let deezerMatches: DeezerMatch[] = [];

      // Skip Spotify if record is found and album art is already present.
      // A Spotify failure (rate limiting / HTTP 429, auth, timeout, …) must not
      // abort the match — degrade to no Spotify result so the Deezer fallback
      // below can still fill in the missing metadata.
      const needsSpotify = !record || !track?.albumArt;
      let spotifyTrack: Track | undefined;
      if (needsSpotify) {
        try {
          spotifyTrack = await searchOnSpotify(
            ctx,
            params.title,
            params.artist,
          );
          if (!spotifyTrack) {
            consola.debug(
              `No Spotify match for "${params.title}" — ${params.artist}, relying on Deezer`,
            );
          }
        } catch (error) {
          // Rate limiting is expected under load and is not an incident; any
          // other failure is. Either way the match continues without Spotify:
          // the Deezer enrichment below is the fallback source.
          if (error instanceof SpotifyRequestError && error.isRateLimited) {
            consola.warn(
              `Spotify is rate limiting (${error.operation}), falling back to Deezer`,
            );
          } else {
            consola.error(
              "Spotify search failed, falling back to Deezer:",
              error instanceof Error ? error.message : error,
            );
          }
          spotifyTrack = undefined;
        }
      }

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
                isrc: spotifyTrack?.external_ids?.isrc ?? null,
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
            isrc: spotifyTrack.external_ids?.isrc || null,
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
        if (track && !track.isrc && spotifyTrack?.external_ids?.isrc) {
          track.isrc = spotifyTrack.external_ids.isrc;
        }
      }

      // Deezer enrichment fallback: when Spotify search fails (or returns
      // partial data) we end up with incomplete metadata. Query Deezer to fill
      // every missing field it can provide, and always surface a ranked list of
      // candidate matches. Deezer can also build the track from scratch when no
      // other source matched.
      const deezerData = await searchOnDeezer(
        ctx,
        params.title,
        params.artist,
        track?.album,
      );

      if (deezerData) {
        deezerMatches = deezerData.matches ?? [];
        const d = deezerData.track;

        if (d) {
          if (!track) {
            track = {
              id: "",
              title: d.title,
              artist: d.artist,
              albumArtist: d.albumArtist ?? d.artist,
              albumArt: d.albumArt ?? null,
              album: d.album,
              trackNumber: d.trackNumber ?? null,
              duration: d.durationMs ?? 0,
              mbId: null,
              isrc: d.isrc ?? null,
              genre: d.genres?.length ? d.genres.join(", ") : null,
              youtubeLink: null,
              spotifyLink: null,
              appleMusicLink: null,
              tidalLink: null,
              sha256: null,
              discNumber: d.discNumber ?? null,
              lyrics: null,
              composer: null,
              label: d.label ?? null,
              copyrightMessage: null,
              uri: null,
              albumUri: null,
              artistUri: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              xataVersion: 0,
            };
          } else {
            if (!track.albumArt && d.albumArt) track.albumArt = d.albumArt;
            if (!track.isrc && d.isrc) track.isrc = d.isrc;
            if (!track.duration && d.durationMs) track.duration = d.durationMs;
            if (!track.trackNumber && d.trackNumber)
              track.trackNumber = d.trackNumber;
            if (!track.discNumber && d.discNumber)
              track.discNumber = d.discNumber;
            if (!track.label && d.label) track.label = d.label;
            if (!track.genre && d.genres?.length)
              track.genre = d.genres.join(", ");
          }

          if (!releaseDate && d.releaseDate) releaseDate = d.releaseDate;
          if (!year && d.year) year = d.year;
          if (!artistPicture && d.artistPicture)
            artistPicture = d.artistPicture;
          if ((!genres || genres.length === 0) && d.genres?.length)
            genres = d.genres;
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
        Promise.resolve(deezerMatches),
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
  matches,
]: [
  SelectTrack,
  number,
  number,
  string | null,
  number | null,
  string | null,
  string[] | null,
  MusicBrainzArtist[] | null,
  DeezerMatch[],
]): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    releaseDate,
    year,
    artistPicture,
    genres,
    mbArtists,
    // Ranked list of candidate matches from Deezer. Additive field — existing
    // consumers of the flattened track view are unaffected. The provider score
    // (0-1) is scaled to an integer 0-100 for the API (lexicons have no float).
    matches: matches.map((m) => ({
      ...m,
      score: Math.round(m.score * 100),
    })),
    playCount,
    uniqueListeners,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }));
};

const MAX_SPOTIFY_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// The whole matchSong pipeline runs under Effect.timeout("10 seconds"), so a
// single Spotify call has to give up well before that — otherwise the timeout
// never fires here and the pipeline is torn down with requests still in flight.
const SPOTIFY_TIMEOUT_MS = 5000;

// Longest Retry-After we are willing to wait out inline. Anything longer means
// the app is properly rate limited: give up on Spotify and let Deezer answer.
const MAX_RETRY_AFTER_MS = 3000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// SpotifyRequestError carries the upstream status so callers can tell a rate
// limit apart from a bad token or a genuine miss.
class SpotifyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
    message?: string,
  ) {
    super(message ?? `Spotify ${operation} failed: ${status}`);
    this.name = "SpotifyRequestError";
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError");

// spotifyGet performs one authenticated GET against the Spotify proxy, with a
// real request timeout and status-aware retries.
//
// The timeout is handed to fetch as a signal rather than raced against the
// promise: abandoning a promise leaves the socket open, so the request keeps
// occupying a slot in the proxy's rate limiter until Node's 300s socket
// timeout fires. That is what turned every retry into a wasted queue slot and
// filled the proxy's log with 502s.
const spotifyGet = async <T>(
  url: string,
  accessToken: string,
  operation: string,
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_SPOTIFY_RETRIES; attempt++) {
    const backoffMs = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
    const isLastAttempt = attempt === MAX_SPOTIFY_RETRIES - 1;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
      });
    } catch (error) {
      // Timeout, abort or network failure — all worth one more try.
      lastError =
        error instanceof Error
          ? error
          : new Error(`Spotify ${operation} failed: ${String(error)}`);
      if (isLastAttempt) throw lastError;
      consola.warn(
        `Spotify ${operation} ${isAbort(error) ? "timed out" : "network error"}, retrying attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES} delay_ms=${backoffMs}`,
      );
      await sleep(backoffMs);
      continue;
    }

    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new SpotifyRequestError(
          response.status,
          operation,
          `Spotify ${operation} returned a malformed body: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 429 from Spotify itself or from the proxy's own queue: both send a
    // Retry-After telling us exactly how long to hold off.
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs;

      if (isLastAttempt || waitMs > MAX_RETRY_AFTER_MS) {
        throw new SpotifyRequestError(
          429,
          operation,
          `Spotify ${operation} rate limited (retry-after: ${retryAfter || "unset"}s)`,
        );
      }
      consola.warn(
        `Spotify ${operation} rate limited, waiting ${waitMs}ms (attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (response.status >= 500) {
      lastError = new SpotifyRequestError(response.status, operation);
      if (isLastAttempt) throw lastError;
      consola.warn(
        `Spotify ${operation} returned ${response.status}, retrying attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES} delay_ms=${backoffMs}`,
      );
      await sleep(backoffMs);
      continue;
    }

    // 400/401/403/404 — retrying with the same token and query cannot help.
    throw new SpotifyRequestError(response.status, operation);
  }

  throw lastError ?? new Error(`Spotify ${operation} exhausted its retries`);
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
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
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

  const response = await spotifyGet<SearchResponse>(
    `${env.SPOTIFY_API_URL}/search?${q}`,
    access_token,
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

    // The search hit already carries everything we strictly need (title,
    // artists, album art, ISRC, links). The album and artist lookups only add
    // detail — label, copyrights, artist picture and genres — so a failure
    // there must not throw away a good match. Whatever they leave missing is
    // exactly what the Deezer enrichment below fills in.
    try {
      track.album = await spotifyGet<Album>(
        `${env.SPOTIFY_API_URL}/albums/${track.album.id}`,
        access_token,
        "get_album",
      );
    } catch (error) {
      consola.warn(
        `Keeping the Spotify search hit without full album detail: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      track.artists[0] = await spotifyGet<Artist>(
        `${env.SPOTIFY_API_URL}/artists/${track.artists[0].id}`,
        access_token,
        "get_artist",
      );
    } catch (error) {
      consola.warn(
        `Keeping the Spotify search hit without full artist detail: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return track;
};

// searchOnDeezer asks the Deezer enrichment service for the best canonical
// track metadata plus a ranked list of candidate matches. It is the fallback
// metadata provider used when Spotify search fails or returns partial data.
const searchOnDeezer = async (
  ctx: Context,
  title: string,
  artist: string,
  album?: string,
): Promise<DeezerEnrichResponse | undefined> => {
  try {
    const { data } = await ctx.deezer.post<DeezerEnrichResponse>("/enrich", {
      title,
      artist,
      album,
    });
    return data;
  } catch (error) {
    consola.error("Error fetching Deezer enrichment:", error);
    return undefined;
  }
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
