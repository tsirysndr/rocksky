import { Agent, BlobRef } from "@atproto/api";
import { TID } from "@atproto/common";
import { HandlerAuth } from "@atproto/xrpc-server";
import chalk from "chalk";
import { Context } from "context";
import { and, eq } from "drizzle-orm";
import { Effect, Match, Option, pipe } from "effect";
import { NoSuchElementException, UnknownException } from "effect/Cause";
import { Server } from "lexicon";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Song from "lexicon/types/app/rocksky/song";
import { InputSchema } from "lexicon/types/app/rocksky/song/createSong";
import { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import { deepSnakeCaseKeys } from "lib";
import { createAgent } from "lib/agent";
import downloadImage from "lib/downloadImage";
import { createHash } from "node:crypto";
import tables from "schema";
import { InsertAlbumTrack, SelectAlbumTrack } from "schema/album-tracks";
import { SelectAlbum } from "schema/albums";
import { InsertArtistAlbum, SelectArtistAlbum } from "schema/artist-albums";
import { InsertArtistTrack, SelectArtistTrack } from "schema/artist-tracks";
import { SelectArtist } from "schema/artists";
import { SelectTrack } from "schema/tracks";
import { Track, trackSchema } from "types/track";

export default function (server: Server, ctx: Context) {
  const createSong = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      { input, ctx, did: auth.credentials?.did },
      withAgent,
      Effect.flatMap(validateInput),
      Effect.flatMap(create),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.song.createSong({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(createSong(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const withAgent = ({
  input,
  ctx,
  did,
}: {
  input: InputSchema;
  ctx: Context;
  did: string;
}): Effect.Effect<InputWithAgent, Error> => {
  return Effect.tryPromise({
    try: () =>
      Match.value(did).pipe(
        Match.when(
          (value) => !!value,
          () =>
            createAgent(ctx.oauthClient, did).then((agent) => ({
              agent,
              ctx,
              did,
              input,
            }))
        ),
        Match.orElse(() => {
          throw new Error("Authentication required to create a song");
        })
      ),
    catch: (error) => new Error(`Failed to create agent: ${error}`),
  });
};

const validateInput = ({
  input,
  ...params
}: InputWithAgent): Effect.Effect<ValidatedInput, Error> =>
  Effect.try(() => ({
    ...params,
    track: trackSchema.safeParse(input).data,
  }));

const create = ({
  ctx,
  agent,
  track,
}: ValidatedInput): Effect.Effect<
  {
    tries: number;
    track: SelectTrack;
    album: SelectAlbum;
    artist: SelectArtist;
    albumTrack: SelectAlbumTrack;
    artistTrack: SelectArtistTrack;
    artistAlbum: SelectArtistAlbum;
  },
  Error | UnknownException | NoSuchElementException,
  never
> => {
  return saveTrack(ctx, track, agent);
};

const presentation = ({
  track,
}: {
  tries: number;
  track: SelectTrack;
  album: SelectAlbum;
  artist: SelectArtist;
  albumTrack: SelectAlbumTrack;
  artistTrack: SelectArtistTrack;
  artistAlbum: SelectArtistAlbum;
}): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }));
};

type InputWithAgent = {
  agent: Agent;
  ctx: Context;
  input: InputSchema;
};

type ValidatedInput = {
  ctx: Context;
  agent: Agent;
  track: Track;
};

const computeTrackHash = (track: Track): Effect.Effect<string, never> =>
  Effect.succeed(
    createHash("sha256")
      .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
      .digest("hex")
  );

const computeAlbumHash = (track: Track): Effect.Effect<string, never> =>
  Effect.succeed(
    createHash("sha256")
      .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
      .digest("hex")
  );

const computeArtistHash = (track: Track): Effect.Effect<string, never> =>
  Effect.succeed(
    createHash("sha256").update(track.albumArtist.toLowerCase()).digest("hex")
  );

const fetchExistingTrack = (
  ctx: Context,
  trackHash: string
): Effect.Effect<SelectTrack | undefined, Error> =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.tracks)
      .where(eq(tables.tracks.sha256, trackHash))
      .execute()
      .then(([row]) => row)
  );

const uploadImage = (url: string, agent: Agent) =>
  pipe(
    Effect.tryPromise(() => downloadImage(url)),
    Effect.map<
      Buffer<ArrayBufferLike>,
      [Buffer<ArrayBufferLike>, { encoding: string } | undefined]
    >((imageBuffer) => {
      if (url.endsWith(".jpeg") || url.endsWith(".jpg")) {
        return [imageBuffer, { encoding: "image/jpeg" }];
      } else if (url.endsWith(".png")) {
        return [imageBuffer, { encoding: "image/png" }];
      }
      return [imageBuffer, undefined];
    }),
    Effect.flatMap(([imageBuffer, options]) =>
      pipe(
        Effect.tryPromise(() => agent.uploadBlob(imageBuffer, options)),
        Effect.map((uploadResponse) => uploadResponse.data.blob)
      )
    ),
    Effect.catchAll(() => Effect.succeed(undefined as BlobRef | undefined))
  );

const generateRkey = Effect.succeed(TID.nextStr());

const putRecord = <T>(
  agent: Agent,
  collection: string,
  record: T,
  validate: (record: T) => { success: boolean }
): Effect.Effect<string, Error> =>
  pipe(
    Effect.succeed(record),
    Effect.filterOrFail(
      (rec) => validate(rec).success,
      () => new Error("Invalid record")
    ),
    Effect.flatMap(() =>
      pipe(
        generateRkey,
        Effect.flatMap((rkey) =>
          Effect.tryPromise(() =>
            agent.com.atproto.repo.putRecord({
              repo: agent.assertDid,
              collection,
              rkey,
              record,
              validate: false,
            })
          )
        ),
        Effect.tap((res) =>
          Effect.logInfo(`Record created at ${res.data.uri}`)
        ),
        Effect.map((res) => res.data.uri)
      )
    ),
    Effect.catchAll((error) => {
      console.error(`Error creating ${collection} record`, error);
      return Effect.fail(error);
    })
  );

const putArtistRecord = (track: Track, agent: Agent) =>
  pipe(
    track.artistPicture
      ? uploadImage(track.artistPicture, agent)
      : Effect.succeed(undefined),
    Effect.map((picture) => ({
      $type: "app.rocksky.artist",
      name: track.albumArtist,
      createdAt: new Date().toISOString(),
      picture,
    })),
    Effect.flatMap((record) =>
      putRecord(agent, "app.rocksky.artist", record, Artist.validateRecord)
    )
  );

const putAlbumRecord = (track: Track, agent: Agent) =>
  pipe(
    Match.value(track.albumArt).pipe(
      Match.when(
        (url) => !!url,
        (url) => uploadImage(url, agent)
      ),
      Match.orElse(() => Effect.succeed(undefined as BlobRef | undefined))
    ),
    Effect.map((albumArt) => ({
      $type: "app.rocksky.album",
      title: track.album,
      artist: track.albumArtist,
      year: track.year,
      releaseDate: track.releaseDate
        ? track.releaseDate.toISOString()
        : undefined,
      createdAt: new Date().toISOString(),
      albumArt,
    })),
    Effect.flatMap((record) =>
      putRecord(agent, "app.rocksky.album", record, Album.validateRecord)
    )
  );

const putSongRecord = (track: Track, agent: Agent) =>
  pipe(
    Match.value(track.albumArt).pipe(
      Match.when(
        (url) => !!url,
        (url) => uploadImage(url, agent)
      ),
      Match.orElse(() => Effect.succeed(undefined as BlobRef | undefined))
    ),
    Effect.map((albumArt) => ({
      $type: "app.rocksky.song",
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      duration: track.duration,
      releaseDate: track.releaseDate
        ? track.releaseDate.toISOString()
        : undefined,
      year: track.year,
      albumArt,
      composer: track.composer ?? undefined,
      lyrics: track.lyrics ?? undefined,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber === 0 ? 1 : track.discNumber,
      copyrightMessage: track.copyrightMessage ?? undefined,
      createdAt: new Date().toISOString(),
      spotifyLink: track.spotifyLink ?? undefined,
    })),
    Effect.flatMap((record) =>
      putRecord(agent, "app.rocksky.song", record, Song.validateRecord)
    )
  );

const ensureTrack = (ctx: Context, track: Track, agent: Agent) =>
  pipe(
    computeTrackHash(track),
    Effect.flatMap((trackHash) =>
      pipe(
        fetchExistingTrack(ctx, trackHash),
        Effect.flatMap((existingTrack) =>
          pipe(
            Option.fromNullable(existingTrack),
            Effect.tap((trackOpt) =>
              trackOpt
                ? updateTrackMetadata(ctx, track, trackOpt)
                : Effect.succeed(undefined)
            ),
            Effect.flatMap((trackOpt) =>
              trackOpt.uri
                ? Effect.succeed(trackOpt.uri)
                : putSongRecord(track, agent)
            )
          )
        )
      )
    )
  );

// Update track metadata (album_uri and artist_uri)
const updateTrackMetadata = (
  ctx: Context,
  track: Track,
  trackRecord: SelectTrack
) =>
  pipe(
    Effect.succeed(trackRecord),
    Effect.tap((trackRecord) =>
      !trackRecord.albumUri
        ? pipe(
            computeAlbumHash(track),
            Effect.flatMap((albumHash) =>
              Effect.tryPromise(() =>
                ctx.db
                  .select()
                  .from(tables.albums)
                  .where(eq(tables.albums.sha256, albumHash))
                  .execute()
                  .then(([row]) => row)
              )
            ),
            Effect.flatMap((album) =>
              Option.fromNullable(album).pipe(
                Effect.flatMap((album) =>
                  Effect.tryPromise(() =>
                    ctx.db
                      .update(tables.tracks)
                      .set({ albumUri: album.uri })
                      .where(eq(tables.tracks.id, trackRecord.id))
                      .execute()
                  )
                ),
                Effect.catchAll(() => Effect.succeed(undefined))
              )
            )
          )
        : Effect.succeed(undefined)
    ),
    Effect.tap((trackRecord) =>
      !trackRecord.artistUri
        ? pipe(
            computeArtistHash(track),
            Effect.flatMap((artistHash) =>
              Effect.tryPromise(() =>
                ctx.db
                  .select()
                  .from(tables.artists)
                  .where(eq(tables.artists.sha256, artistHash))
                  .execute()
                  .then(([row]) => row)
              )
            ),
            Effect.flatMap((artist) =>
              Option.fromNullable(artist).pipe(
                Effect.flatMap((artist) =>
                  Effect.tryPromise(() =>
                    ctx.db
                      .update(tables.tracks)
                      .set({ artistUri: artist.uri })
                      .where(eq(tables.tracks.id, trackRecord.id))
                      .execute()
                  )
                ),
                Effect.catchAll(() => Effect.succeed(undefined))
              )
            )
          )
        : Effect.succeed(undefined)
    )
  );

// Ensure artist exists or create it
const ensureArtist = (ctx: Context, track: Track, agent: Agent) =>
  pipe(
    computeArtistHash(track),
    Effect.flatMap((artistHash) =>
      pipe(
        Effect.tryPromise(() =>
          ctx.db
            .select()
            .from(tables.artists)
            .where(eq(tables.artists.sha256, artistHash))
            .execute()
            .then(([row]) => row)
        ),
        Effect.flatMap((existingArtist) =>
          pipe(
            Option.fromNullable(existingArtist),
            Effect.flatMap((artistOpt) =>
              artistOpt.uri
                ? Effect.succeed(artistOpt.uri)
                : putArtistRecord(track, agent)
            )
          )
        )
      )
    )
  );

// Ensure album exists or create it
const ensureAlbum = (ctx: Context, track: Track, agent: Agent) =>
  pipe(
    computeAlbumHash(track),
    Effect.flatMap((albumHash) =>
      pipe(
        Effect.tryPromise(() =>
          ctx.db
            .select()
            .from(tables.albums)
            .where(eq(tables.albums.sha256, albumHash))
            .execute()
            .then(([row]) => row)
        ),
        Effect.flatMap((existingAlbum) =>
          pipe(
            Option.fromNullable(existingAlbum),
            Effect.flatMap((albumOpt) =>
              albumOpt.uri
                ? Effect.succeed(albumOpt.uri)
                : putAlbumRecord(track, agent)
            )
          )
        )
      )
    )
  );

// Fetch track, album, and artist by URIs
const fetchRecordsByUris = (
  ctx: Context,
  trackUri: string,
  albumUri: string,
  artistUri: string
): Effect.Effect<
  {
    track: SelectTrack | null;
    album: SelectAlbum | null;
    artist: SelectArtist | null;
  },
  Error
> =>
  Effect.all({
    track: Effect.tryPromise(() =>
      ctx.db
        .select()
        .from(tables.tracks)
        .where(eq(tables.tracks.uri, trackUri))
        .execute()
        .then(([row]) => row)
    ),
    album: Effect.tryPromise(() =>
      ctx.db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.uri, albumUri))
        .execute()
        .then(([row]) => row)
    ),
    artist: Effect.tryPromise(() =>
      ctx.db
        .select()
        .from(tables.artists)
        .where(eq(tables.artists.uri, artistUri))
        .execute()
        .then(([row]) => row)
    ),
  });

// Ensure relationships (album_track, artist_track, artist_album)
const ensureRelationships = (
  ctx: Context,
  track: SelectTrack,
  album: SelectAlbum,
  artist: SelectArtist
) =>
  pipe(
    Effect.all({
      albumTrack: Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.albumTracks)
          .where(
            and(
              eq(tables.albumTracks.albumId, album.id),
              eq(tables.albumTracks.trackId, track.id)
            )
          )
          .execute()
          .then(([row]) => row)
      ),

      artistTrack: Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.artistTracks)
          .where(
            and(
              eq(tables.artistTracks.artistId, artist.id),
              eq(tables.artistTracks.trackId, track.id)
            )
          )
          .execute()
          .then(([row]) => row)
      ),
      artistAlbum: Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.artistAlbums)
          .where(
            and(
              eq(tables.artistAlbums.artistId, artist.id),
              eq(tables.artistAlbums.albumId, album.id)
            )
          )
          .execute()
          .then(([row]) => row)
      ),
    }),
    Effect.flatMap(({ albumTrack, artistTrack, artistAlbum }) =>
      pipe(
        Effect.all([
          pipe(
            Option.fromNullable(albumTrack),
            Effect.orElse(() =>
              Effect.tryPromise(() =>
                ctx.db
                  .insert(tables.albumTracks)
                  .values({
                    albumId: album.id,
                    trackId: track.id,
                  } as InsertAlbumTrack)
                  .returning()
                  .execute()
                  .then(([row]) => row)
              )
            )
          ),
          pipe(
            Option.fromNullable(artistTrack),
            Effect.orElse(() =>
              Effect.tryPromise(() =>
                ctx.db
                  .insert(tables.artistTracks)
                  .values({
                    artistId: artist.id,
                    trackId: track.id,
                  } as InsertArtistTrack)
                  .returning()
                  .execute()
                  .then(([row]) => row)
              )
            )
          ),
          pipe(
            Option.fromNullable(artistAlbum),
            Effect.orElse(() =>
              Effect.tryPromise(() =>
                ctx.db
                  .insert(tables.artistAlbums)
                  .values({
                    artistId: artist.id,
                    albumId: album.id,
                  } as InsertArtistAlbum)
                  .returning()
                  .execute()
                  .then(([row]) => row)
              )
            )
          ),
        ]),
        Effect.map(([albumTrack, artistTrack, artistAlbum]) => ({
          albumTrack,
          artistTrack,
          artistAlbum,
        }))
      )
    )
  );

// Update track with album and artist URIs if missing
const updateTrackUris = (
  ctx: Context,
  track: SelectTrack,
  album: SelectAlbum,
  artist: SelectArtist
) =>
  pipe(
    Effect.succeed(track),
    Effect.tap((trackRecord) =>
      !trackRecord.albumUri
        ? Effect.tryPromise(() =>
            ctx.db
              .update(tables.tracks)
              .set({
                albumUri: album.uri,
              })
              .where(eq(tables.tracks.id, trackRecord.id))
              .execute()
          )
        : Effect.succeed(undefined)
    ),
    Effect.tap((trackRecord) =>
      !trackRecord.artistUri
        ? Effect.tryPromise(() =>
            ctx.db
              .update(tables.tracks)
              .set({
                artistUri: artist.uri,
              })
              .where(eq(tables.tracks.id, trackRecord.id))
              .execute()
          )
        : Effect.succeed(undefined)
    )
  );

const publishTrack = (
  ctx: Context,
  track: SelectTrack,
  albumTrack: SelectAlbumTrack,
  artistTrack: SelectArtistTrack,
  artistAlbum: SelectArtistAlbum
) =>
  pipe(
    Effect.succeed(
      deepSnakeCaseKeys({
        track: {
          ...track,
          sha256: track.sha256,
          uri: track.uri,
          xata_createdat: track.createdAt.toISOString(),
          xata_id: track.id,
          xata_updatedat: track.updatedAt.toISOString(),
          xata_version: track.xataVersion,
        },
        album_track: {
          xata_id: albumTrack.id,
          album_id: {
            xata_id: albumTrack.albumId,
          },
          track_id: {
            xata_id: albumTrack.trackId,
          },
          xata_createdat: albumTrack.createdAt.toISOString(),
          xata_updatedat: albumTrack.updatedAt.toISOString(),
          xata_version: albumTrack.xataVersion,
        },
        artist_track: {
          xata_id: artistTrack.id,
          artist_id: {
            xata_id: artistTrack.artistId,
          },
          track_id: {
            xata_id: artistTrack.trackId,
          },
          xata_createdat: artistTrack.createdAt.toISOString(),
          xata_updatedat: artistTrack.updatedAt.toISOString(),
          xata_version: artistTrack.xataVersion,
        },
        artist_album: {
          xata_id: artistAlbum.id,
          artist_id: {
            xata_id: artistAlbum.artistId,
          },
          album_id: {
            xata_id: artistAlbum.albumId,
          },
          xata_createdat: artistAlbum.createdAt.toISOString(),
          xata_updatedat: artistAlbum.updatedAt.toISOString(),
          xata_version: artistAlbum.xataVersion,
        },
      })
    ),
    Effect.flatMap((message) =>
      Effect.try(() =>
        ctx.nc.publish(
          "rocksky.track",
          Buffer.from(JSON.stringify(message).replaceAll("sha_256", "sha256"))
        )
      )
    )
  );

export const saveTrack = (ctx: Context, track: Track, agent: Agent) =>
  pipe(
    Effect.all({
      trackUri: ensureTrack(ctx, track, agent),
      albumUri: ensureAlbum(ctx, track, agent),
      artistUri: ensureArtist(ctx, track, agent),
    }),
    Effect.flatMap(({ trackUri, albumUri, artistUri }) =>
      pipe(
        Effect.iterate(
          {
            tries: 0,
            track: null,
            album: null,
            artist: null,
            albumTrack: null,
            artistTrack: null,
            artistAlbum: null,
          },
          {
            while: ({
              tries,
              track,
              album,
              artist,
              albumTrack,
              artistTrack,
              artistAlbum,
            }) =>
              tries < 15 &&
              !(
                track &&
                album &&
                artist &&
                albumTrack &&
                artistTrack &&
                artistAlbum &&
                track.albumUri &&
                track.artistUri
              ),
            body: ({ tries }) =>
              pipe(
                fetchRecordsByUris(ctx, trackUri, albumUri, artistUri),
                Effect.flatMap(({ track, album, artist }) =>
                  pipe(
                    Effect.all([
                      Option.fromNullable(track).pipe(
                        Effect.filterOrFail(
                          () => !!track,
                          () =>
                            new Error(`Track not found for uri: ${trackUri}`)
                        )
                      ),
                      Option.fromNullable(album).pipe(
                        Effect.filterOrFail(
                          () => !!album,
                          () =>
                            new Error(`Album not found for uri: ${albumUri}`)
                        )
                      ),
                      Option.fromNullable(artist).pipe(
                        Effect.filterOrFail(
                          () => !!artist,
                          () =>
                            new Error(`Artist not found for uri: ${artistUri}`)
                        )
                      ),
                    ]),
                    Effect.flatMap(([track, album, artist]) =>
                      pipe(
                        updateTrackUris(ctx, track, album, artist),
                        Effect.flatMap(() =>
                          ensureRelationships(ctx, track, album, artist)
                        ),
                        Effect.map(
                          ({ albumTrack, artistTrack, artistAlbum }) => ({
                            tries: tries + 1,
                            track,
                            album,
                            artist,
                            albumTrack,
                            artistTrack,
                            artistAlbum,
                          })
                        )
                      )
                    )
                  )
                ),
                Effect.tap(
                  ({
                    tries,
                    track,
                    album,
                    artist,
                    albumTrack,
                    artistTrack,
                    artistAlbum,
                  }) =>
                    Effect.logInfo(
                      track &&
                        album &&
                        artist &&
                        albumTrack &&
                        artistTrack &&
                        artistAlbum &&
                        track.albumUri &&
                        track.artistUri
                        ? `Track saved successfully after ${chalk.magenta(tries + 1)} tries`
                        : `Track not yet saved, retrying... ${chalk.magenta(tries + 1)}`
                    )
                ),
                Effect.tap(
                  ({
                    tries,
                    track,
                    album,
                    artist,
                    albumTrack,
                    artistTrack,
                    artistAlbum,
                  }) =>
                    tries === 15
                      ? pipe(
                          Effect.logError(
                            "Failed to save track after 15 tries"
                          ),
                          Effect.tap(() =>
                            Effect.logDebug(
                              `Debug info: track=${JSON.stringify(track)}, album=${JSON.stringify(album)}, artist=${JSON.stringify(artist)}, albumTrack=${JSON.stringify(albumTrack)}, artistTrack=${JSON.stringify(artistTrack)}, artistAlbum=${JSON.stringify(artistAlbum)}`
                            )
                          )
                        )
                      : Effect.succeed(undefined)
                ),
                Effect.delay("1 second")
              ),
          }
        ),
        Effect.tap(({ tries, track, albumTrack, artistTrack, artistAlbum }) =>
          tries < 15 && track && albumTrack && artistTrack && artistAlbum
            ? publishTrack(ctx, track, albumTrack, artistTrack, artistAlbum)
            : Effect.succeed(undefined)
        )
      )
    )
  );
