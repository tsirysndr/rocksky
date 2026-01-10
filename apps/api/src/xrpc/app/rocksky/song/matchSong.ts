import type { Context } from "context";
import { and, count, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/matchSong";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";
import { Album, Artist, SearchResponse, Track } from "./types";

export default function (server: Server, ctx: Context) {
  const matchSong = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.song.matchSong({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(matchSong(params));
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
      let record = await ctx.db
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
        .where(
          or(
            and(
              eq(tables.tracks.title, params.title),
              eq(tables.tracks.artist, params.artist),
            ),
            and(
              eq(tables.tracks.title, params.title),
              eq(tables.tracks.albumArtist, params.artist),
            ),
          ),
        )
        .execute()
        .then(([row]) => row);

      let track = record?.tracks;

      let releaseDate = null,
        year = null,
        artistPicture = null,
        genres = null;

      if (!record) {
        const spotifyTrack = await searchOnSpotify(
          ctx,
          params.title,
          params.artist,
        );
        if (spotifyTrack) {
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
]: [
  SelectTrack,
  number,
  number,
  string | null,
  number | null,
  string | null,
  string[] | null,
]): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    releaseDate,
    year,
    artistPicture,
    genres,
    playCount,
    uniqueListeners,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }));
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
    console.warn("No Spotify tokens available for beta users");
    return undefined;
  }

  const { spotify_tokens, spotify_apps } =
    spotifyTokens[Math.floor(Math.random() * spotifyTokens.length)];

  if (!spotify_tokens || !spotify_apps) {
    console.warn("Invalid Spotify token or app data");
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

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const q = `q=track:"${encodeURIComponent(title)}"%20artist:"${encodeURIComponent(artist)}"&type=track`;
  const response = await fetch(`https://api.spotify.com/v1/search?${q}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  }).then((res) => res.json<SearchResponse>());

  const track = response.tracks?.items?.[0];

  if (track) {
    const album = await fetch(
      `https://api.spotify.com/v1/albums/${track.album.id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    ).then((res) => res.json<Album>());

    track.album = album;

    const artist = await fetch(
      `https://api.spotify.com/v1/artists/${track.artists[0].id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    ).then((res) => res.json<Artist>());

    track.artists[0] = artist;
  }

  return track;
};
