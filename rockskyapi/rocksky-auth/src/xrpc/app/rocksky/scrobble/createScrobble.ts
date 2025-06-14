import { Agent, BlobRef } from "@atproto/api";
import { TID } from "@atproto/common";
import { HandlerAuth } from "@atproto/xrpc-server";
import chalk from "chalk";
import { Context } from "context";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import { Effect, Match, Option, pipe } from "effect";
import { Server } from "lexicon";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import { InputSchema } from "lexicon/types/app/rocksky/scrobble/createScrobble";
import { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import * as Song from "lexicon/types/app/rocksky/song";
import { deepSnakeCaseKeys } from "lib";
import { createAgent } from "lib/agent";
import downloadImage from "lib/downloadImage";
import { createHash } from "node:crypto";
import tables from "schema";
import { SelectAlbum } from "schema/albums";
import { SelectArtist } from "schema/artists";
import { SelectScrobble } from "schema/scrobbles";
import { SelectTrack } from "schema/tracks";
import { InsertUserAlbum } from "schema/user-albums";
import { InsertUserArtist } from "schema/user-artists";
import { InsertUserTrack } from "schema/user-tracks";
import { SelectUser } from "schema/users";
import { Track, trackSchema } from "types/track";

export default function (server: Server, ctx: Context) {
  const createScrobble = (input, auth: HandlerAuth) =>
    pipe(
      { input, ctx, did: auth.credentials?.did },
      withAgent,
      Effect.flatMap(validateInput),
      Effect.flatMap(({ track, ctx, did, agent }) =>
        pipe(
          scrobbleTrack(ctx, track, agent, did),
          Effect.tap(() =>
            Effect.logInfo(`Scrobble created for ${chalk.cyan(track.title)}`)
          )
        )
      ),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("600 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.scrobble.createScrobble({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(createScrobble(input.body, auth));
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
    try: async () =>
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
          throw new Error("Authentication required to create a scrobble");
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

const presentation = (): Effect.Effect<ScrobbleViewBasic, never> => {
  return Effect.sync(() => ({}));
};

type InputWithAgent = {
  input: InputSchema;
  ctx: Context;
  did: string;
  agent: Agent;
};

type ValidatedInput = {
  track: Track;
  ctx: Context;
  did: string;
  agent: Agent;
};

const generateRkey = Effect.succeed(TID.nextStr());

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

const putRecord = <T>(
  agent: Agent,
  collection: string,
  record: T,
  validate: (record: T) => { success: boolean }
) =>
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
      return Effect.succeed(null);
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

const putScrobbleRecord = (track: Track, agent: Agent) =>
  pipe(
    Match.value(track.albumArt).pipe(
      Match.when(
        (url) => !!url,
        (url) => uploadImage(url, agent)
      ),
      Match.orElse(() => Effect.succeed(undefined as BlobRef | undefined))
    ),
    Effect.map((albumArt) => ({
      $type: "app.rocksky.scrobble",
      title: track.title,
      albumArtist: track.albumArtist,
      albumArt,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber === 0 ? 1 : track.discNumber,
      releaseDate: track.releaseDate
        ? track.releaseDate.toISOString()
        : undefined,
      year: track.year,
      composer: track.composer ?? undefined,
      lyrics: track.lyrics ?? undefined,
      copyrightMessage: track.copyrightMessage ?? undefined,
      createdAt: track.timestamp
        ? dayjs.unix(track.timestamp).toISOString()
        : new Date().toISOString(),
      spotifyLink: track.spotifyLink ?? undefined,
    })),
    Effect.flatMap((record) =>
      putRecord(agent, "app.rocksky.scrobble", record, Scrobble.validateRecord)
    )
  );

const getScrobble = ({ ctx, id }: { ctx: Context; id: string }) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.scrobbles)
      .leftJoin(tables.tracks, eq(tables.tracks.id, tables.scrobbles.trackId))
      .leftJoin(tables.albums, eq(tables.albums.id, tables.scrobbles.albumId))
      .leftJoin(
        tables.artists,
        eq(tables.artists.id, tables.scrobbles.artistId)
      )
      .leftJoin(tables.users, eq(tables.users.id, tables.scrobbles.userId))
      .where(eq(tables.scrobbles.id, id))
      .execute()
      .then(([row]) => row)
  );

const getUserAlbum = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.userAlbums)
      .where(eq(tables.userAlbums.albumId, scrobble.albums.id))
      .execute()
      .then(([row]) => row)
  );

const getUserArtist = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.userArtists)
      .where(eq(tables.userArtists.id, scrobble.artists.id))
      .execute()
      .then(([row]) => row)
  );

const getUserTrack = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.userTracks)
      .where(eq(tables.userTracks.id, scrobble.tracks.id))
      .execute()
      .then(([row]) => row)
  );

const getAlbumTrack = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.albumTracks)
      .where(eq(tables.albumTracks.trackId, scrobble.tracks.id))
      .execute()
      .then(([row]) => row)
  );

const getArtistTrack = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.artistTracks)
      .where(eq(tables.artistTracks.trackId, scrobble.tracks.id))
      .execute()
      .then(([row]) => row)
  );

const getArtistAlbum = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  Effect.tryPromise(() =>
    ctx.db
      .select()
      .from(tables.artistAlbums)
      .where(
        and(
          eq(tables.artistAlbums.albumId, scrobble.albums.id),
          eq(tables.artistAlbums.artistId, scrobble.artists.id)
        )
      )
      .then(([row]) => row)
  );

const createUserArtist = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  pipe(
    Effect.tryPromise(() =>
      ctx.db
        .insert(tables.userArtists)
        .values({
          userId: scrobble.users.id,
          artistId: scrobble.artists.id,
          uri: scrobble.artists.uri,
          scrobbles: 1,
        } as InsertUserArtist)
        .execute()
    ),
    Effect.flatMap(() =>
      Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.userArtists)
          .where(eq(tables.userArtists.artistId, scrobble.artists.id))
          .execute()
          .then(([row]) => row)
      )
    )
  );

const createUserAlbum = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  pipe(
    Effect.tryPromise(() =>
      ctx.db
        .insert(tables.userAlbums)
        .values({
          userId: scrobble.users.id,
          albumId: scrobble.albums.id,
          uri: scrobble.albums.uri,
          scrobbles: 1,
        } as InsertUserAlbum)
        .execute()
    ),
    Effect.flatMap(() =>
      Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.userAlbums)
          .where(eq(tables.userAlbums.albumId, scrobble.albums.id))
          .execute()
          .then(([row]) => row)
      )
    )
  );

const createUserTrack = (
  ctx: Context,
  scrobble: {
    albums: SelectAlbum;
    artists: SelectArtist;
    users: SelectUser;
    tracks: SelectTrack;
  }
) =>
  pipe(
    Effect.tryPromise(() =>
      ctx.db
        .insert(tables.userTracks)
        .values({
          userId: scrobble.users.id,
          trackId: scrobble.tracks.id,
          uri: scrobble.tracks.uri,
          scrobbles: 1,
        } as InsertUserTrack)
        .execute()
    ),
    Effect.flatMap(() =>
      Effect.tryPromise(() =>
        ctx.db
          .select()
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, scrobble.tracks.id))
          .then(([row]) => row)
      )
    )
  );

const publishScrobble = (ctx: Context, id: string) =>
  pipe(
    { ctx, id },
    getScrobble,
    Effect.flatMap((scrobble) =>
      pipe(
        Effect.all([
          getUserAlbum(ctx, scrobble),
          getUserArtist(ctx, scrobble),
          getUserTrack(ctx, scrobble),
          getAlbumTrack(ctx, scrobble),
          getArtistTrack(ctx, scrobble),
          getArtistAlbum(ctx, scrobble),
        ]),
        Effect.flatMap(
          ([
            userAlbum,
            userArtist,
            userTrack,
            albumTrack,
            artistTrack,
            artistAlbum,
          ]) =>
            pipe(
              Option.fromNullable(userArtist),
              Effect.orElse(() => createUserArtist(ctx, scrobble)),
              Effect.flatMap((finalUserArtist) =>
                pipe(
                  Option.fromNullable(userAlbum),
                  Effect.orElse(() => createUserAlbum(ctx, scrobble)),
                  Effect.flatMap((finalUserAlbum) =>
                    pipe(
                      Option.fromNullable(userTrack),
                      Effect.orElse(() => createUserTrack(ctx, scrobble)),
                      Effect.map((finalUserTrack) =>
                        deepSnakeCaseKeys({
                          scrobble: {
                            album_id: {
                              ...scrobble.albums,
                              xata_createdat:
                                scrobble.albums.createdAt.toISOString(),
                              xata_id: scrobble.albums.id,
                              xata_updatedat:
                                scrobble.albums.updatedAt.toISOString(),
                              xata_version: scrobble.albums.xataVersion,
                            },
                            artist_id: {
                              ...scrobble.artists,
                              xata_createdat:
                                scrobble.artists.createdAt.toISOString(),
                              xata_id: scrobble.artists.id,
                              xata_updatedat:
                                scrobble.artists.updatedAt.toISOString(),
                              xata_version: scrobble.artists.xataVersion,
                            },
                            track_id: {
                              ...scrobble.tracks,
                              xata_createdat:
                                scrobble.tracks.createdAt.toISOString(),
                              xata_id: scrobble.tracks.id,
                              xata_updatedat:
                                scrobble.tracks.updatedAt.toISOString(),
                              xata_version: scrobble.tracks.xataVersion,
                            },
                            uri: scrobble.scrobbles.uri,
                            user_id: {
                              avatar: scrobble.users.avatar,
                              did: scrobble.users.did,
                              display_name: scrobble.users.displayName,
                              handle: scrobble.users.handle,
                              xata_createdat:
                                scrobble.users.createdAt.toISOString(),
                              xata_id: scrobble.users.id,
                              xata_updatedat:
                                scrobble.users.updatedAt.toISOString(),
                              xata_version: scrobble.users.xataVersion,
                            },
                            xata_createdat:
                              scrobble.scrobbles.createdAt.toISOString(),
                            xata_id: scrobble.scrobbles.id,
                            xata_updatedat:
                              scrobble.scrobbles.updatedAt.toISOString(),
                            xata_version: scrobble.scrobbles.xataVersion,
                            timestamp:
                              scrobble.scrobbles.timestamp.toISOString(),
                          },
                          user_album: {
                            album_id: { xata_id: finalUserAlbum.albumId },
                            scrobbles: finalUserAlbum.scrobbles,
                            uri: finalUserAlbum.uri,
                            user_id: {
                              xata_id: finalUserAlbum.userId,
                            },
                            xata_createdat:
                              finalUserAlbum.createdAt.toISOString(),
                            xata_id: finalUserAlbum.id,
                            xata_updatedat:
                              finalUserAlbum.updatedAt.toISOString(),
                            xata_version: finalUserAlbum.xataVersion,
                          },
                          user_artist: {
                            artist_id: {
                              xata_id: finalUserArtist.artistId,
                            },
                            scrobbles: finalUserArtist.scrobbles,
                            uri: finalUserArtist.uri,
                            user_id: {
                              xata_id: finalUserArtist.userId,
                            },
                            xata_createdat:
                              finalUserArtist.createdAt.toISOString(),
                            xata_id: finalUserArtist.id,
                            xata_updatedat:
                              finalUserArtist.updatedAt.toISOString(),
                            xata_version: finalUserArtist.xataVersion,
                          },
                          user_track: {
                            scrobbles: finalUserTrack.scrobbles,
                            track_id: {
                              xata_id: finalUserTrack.trackId,
                            },
                            uri: finalUserTrack.uri,
                            user_id: {
                              xata_id: finalUserTrack.userId,
                            },
                            xata_createdat:
                              finalUserTrack.createdAt.toISOString(),
                            xata_id: finalUserTrack.id,
                            xata_updatedat:
                              finalUserTrack.updatedAt.toISOString(),
                            xata_version: finalUserTrack.xataVersion,
                          },
                          album_track: albumTrack,
                          artist_track: artistTrack,
                          artist_album: artistAlbum,
                        })
                      )
                    )
                  )
                )
              ),
              Effect.flatMap((data) =>
                Effect.try(() =>
                  ctx.nc.publish(
                    "rocksky.scrobble",
                    Buffer.from(
                      JSON.stringify(data).replaceAll("sha_256", "sha256")
                    )
                  )
                )
              )
            )
        )
      )
    )
  );

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
              album
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
              artist
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
          )
        : Effect.succeed(undefined)
    )
  );

// Ensure track exists or create it
const ensureTrack = (
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string,
  existingTrack: SelectTrack | undefined
) =>
  pipe(
    Effect.succeed(existingTrack),
    Effect.tap((trackOpt) =>
      Match.value(trackOpt).pipe(
        Match.when(
          (value) => !!value,
          () => updateTrackMetadata(ctx, track, trackOpt)
        ),
        Match.orElse(() => Effect.succeed(undefined))
      )
    ),
    Effect.flatMap((trackOpt) =>
      pipe(
        Effect.tryPromise(() =>
          ctx.db
            .select()
            .from(tables.userTracks)
            .leftJoin(
              tables.tracks,
              eq(tables.userTracks.trackId, tables.tracks.id)
            )
            .leftJoin(
              tables.users,
              eq(tables.userTracks.userId, tables.users.id)
            )
            .where(
              and(
                eq(tables.tracks.id, trackOpt?.id),
                eq(tables.users.did, userDid)
              )
            )
            .execute()
            .then(([row]) => row.user_tracks)
        ),
        Effect.flatMap((userTrack) =>
          Option.isNone(Option.fromNullable(userTrack)) ||
          !userTrack?.uri?.includes(userDid)
            ? putSongRecord(track, agent)
            : Effect.succeed(null)
        )
      )
    )
  );

// Ensure album exists or create it
const ensureAlbum = (
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string
) =>
  pipe(
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
    Effect.flatMap((existingAlbum) =>
      pipe(
        Option.fromNullable(existingAlbum),
        Effect.flatMap((album) =>
          Effect.tryPromise(() =>
            ctx.db
              .select()
              .from(tables.userAlbums)
              .leftJoin(
                tables.albums,
                eq(tables.userAlbums.albumId, tables.albums.id)
              )
              .leftJoin(
                tables.users,
                eq(tables.userAlbums.userId, tables.users.id)
              )
              .where(
                and(
                  eq(tables.albums.id, album.id),
                  eq(tables.users.did, userDid)
                )
              )
              .execute()
              .then(([row]) => row.user_albums)
          )
        ),
        Effect.flatMap((userAlbum) =>
          Option.isNone(Option.fromNullable(existingAlbum)) ||
          Option.isNone(Option.fromNullable(userAlbum)) ||
          !userAlbum?.uri?.includes(userDid)
            ? putAlbumRecord(track, agent)
            : Effect.succeed(null)
        )
      )
    )
  );

// Ensure artist exists or create it
const ensureArtist = (
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string
) =>
  pipe(
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
    Effect.flatMap((existingArtist) =>
      pipe(
        Option.fromNullable(existingArtist),
        Effect.flatMap((artist) =>
          Effect.tryPromise(() =>
            ctx.db
              .select()
              .from(tables.userArtists)
              .leftJoin(
                tables.artists,
                eq(tables.userArtists.artistId, tables.artists.id)
              )
              .leftJoin(
                tables.users,
                eq(tables.userArtists.userId, tables.users.id)
              )
              .where(
                and(
                  eq(tables.artists.id, artist.id),
                  eq(tables.users.did, userDid)
                )
              )
              .execute()
              .then(([row]) => row.user_artists)
          )
        ),
        Effect.flatMap((userArtist) =>
          Effect.if(
            Option.isNone(Option.fromNullable(existingArtist)) ||
              Option.isNone(Option.fromNullable(userArtist)) ||
              !userArtist?.uri?.includes(userDid),
            {
              onTrue: () => putArtistRecord(track, agent),
              onFalse: () => Effect.succeed(null),
            }
          )
        )
      )
    )
  );

// Retry fetching track until metadata is ready
const retryFetchTrack = (
  ctx: Context,
  trackHash: string,
  initialTrack: SelectTrack | undefined
) =>
  pipe(
    Effect.iterate(
      { tries: 0, track: initialTrack },
      {
        while: ({ tries, track }) =>
          tries < 30 && !(track?.artistUri && track?.albumUri),
        body: ({ tries, track }) =>
          pipe(
            Effect.tryPromise(() =>
              ctx.db
                .select()
                .from(tables.tracks)
                .where(eq(tables.tracks.sha256, trackHash))
                .execute()
                .then(([row]) => row)
            ),
            Effect.flatMap((trackRecord) =>
              Option.fromNullable(trackRecord).pipe(
                Effect.flatMap((track) =>
                  updateTrackMetadata(ctx, track, trackRecord)
                )
              )
            ),
            Effect.tap((trackRecord) =>
              Effect.logInfo(
                trackRecord
                  ? `Track metadata ready: ${chalk.cyan(trackRecord.id)} - ${track.title}, after ${chalk.magenta(tries + 1)} tries`
                  : `Retrying track fetch: ${chalk.magenta(tries + 1)}`
              )
            ),
            Effect.map((trackRecord) => ({
              tries: tries + 1,
              track: trackRecord,
            })),
            Effect.delay("1 second")
          ),
      }
    ),
    Effect.tap(({ tries, track }) =>
      tries >= 30 && !(track?.artistUri && track?.albumUri)
        ? Effect.logError(
            `Track metadata not ready after ${chalk.magenta("30 tries")}`
          )
        : Effect.succeed(undefined)
    ),
    Effect.map(({ track }) => track)
  );

// Retry fetching scrobble until complete
const retryFetchScrobble = (ctx: Context, scrobbleUri: string) =>
  pipe(
    Effect.iterate(
      {
        tries: 0,
        scrobble: null as {
          tracks?: SelectTrack;
          albums?: SelectAlbum;
          artists?: SelectArtist;
          users?: SelectUser;
          scrobbles?: SelectScrobble;
        } | null,
      },
      {
        while: ({ tries, scrobble }) =>
          tries < 30 &&
          !(
            scrobble &&
            scrobble.tracks &&
            scrobble.albums &&
            scrobble.artists &&
            scrobble.albums.artistUri &&
            scrobble.tracks.artistUri &&
            scrobble.tracks.albumUri &&
            scrobble.scrobbles
          ),
        body: ({ tries }) =>
          pipe(
            Effect.tryPromise(() =>
              ctx.db
                .select()
                .from(tables.scrobbles)
                .leftJoin(
                  tables.tracks,
                  eq(tables.scrobbles.trackId, tables.tracks.id)
                )
                .leftJoin(
                  tables.albums,
                  eq(tables.scrobbles.albumId, tables.albums.id)
                )
                .leftJoin(
                  tables.artists,
                  eq(tables.scrobbles.artistId, tables.artists.id)
                )
                .leftJoin(
                  tables.users,
                  eq(tables.scrobbles.userId, tables.users.id)
                )
                .where(eq(tables.scrobbles.uri, scrobbleUri))
                .execute()
                .then(([row]) => row)
            ),
            Effect.tap((scrobble) =>
              Effect.if(
                !!scrobble &&
                  !!scrobble.albums &&
                  !scrobble.albums.artistUri &&
                  !!scrobble.artists.uri,
                {
                  onTrue: () =>
                    Effect.tryPromise(() =>
                      ctx.db
                        .update(tables.albums)
                        .set({
                          artistUri: scrobble.artists.uri,
                        })
                        .where(eq(tables.albums.id, scrobble.albums.id))
                        .execute()
                    ),
                  onFalse: () => Effect.succeed(undefined),
                }
              )
            ),
            Effect.flatMap(() =>
              Effect.tryPromise(() =>
                ctx.db
                  .select()
                  .from(tables.scrobbles)
                  .leftJoin(
                    tables.tracks,
                    eq(tables.scrobbles.trackId, tables.tracks.id)
                  )
                  .leftJoin(
                    tables.albums,
                    eq(tables.scrobbles.albumId, tables.albums.id)
                  )
                  .leftJoin(
                    tables.artists,
                    eq(tables.scrobbles.artistId, tables.artists.id)
                  )
                  .leftJoin(
                    tables.users,
                    eq(tables.scrobbles.userId, tables.users.id)
                  )
                  .where(eq(tables.scrobbles.uri, scrobbleUri))
                  .execute()
                  .then(([row]) => row)
              )
            ),
            Effect.map((scrobble) => ({
              tries: tries + 1,
              scrobble,
            })),
            Effect.tap(({ scrobble, tries }) =>
              Effect.logInfo(
                scrobble &&
                  scrobble.tracks &&
                  scrobble.albums &&
                  scrobble.artists &&
                  scrobble.albums.artistUri &&
                  scrobble.tracks.artistUri &&
                  scrobble.tracks.albumUri &&
                  scrobble.scrobbles
                  ? `Scrobble found after ${chalk.magenta(tries + 1)} tries`
                  : `Scrobble not found, trying again: ${chalk.magenta(tries + 1)}`
              )
            ),
            Effect.delay("1 second")
          ),
      }
    ),
    Effect.tap(({ tries, scrobble }) =>
      tries >= 30 &&
      !(
        scrobble &&
        scrobble.tracks &&
        scrobble.albums &&
        scrobble.artists &&
        scrobble.albums.artistUri &&
        scrobble.tracks.artistUri &&
        scrobble.tracks.albumUri
      )
        ? Effect.logError(
            `Scrobble not found after ${chalk.magenta("30 tries")}`
          )
        : Effect.succeed(undefined)
    ),
    Effect.map(({ scrobble }) => scrobble)
  );

export const scrobbleTrack = (
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string
) =>
  pipe(
    computeTrackHash(track),
    Effect.flatMap((trackHash) =>
      pipe(
        fetchExistingTrack(ctx, trackHash),
        Effect.flatMap((existingTrack) =>
          pipe(
            ensureTrack(ctx, track, agent, userDid, existingTrack),
            Effect.flatMap(() => ensureAlbum(ctx, track, agent, userDid)),
            Effect.flatMap(() => ensureArtist(ctx, track, agent, userDid)),
            Effect.flatMap(() =>
              retryFetchTrack(ctx, trackHash, existingTrack)
            ),
            Effect.flatMap(() =>
              pipe(
                putScrobbleRecord(track, agent),
                Effect.flatMap((scrobbleUri) =>
                  pipe(
                    retryFetchScrobble(ctx, scrobbleUri),
                    Effect.flatMap((scrobble) =>
                      scrobble &&
                      scrobble.tracks &&
                      scrobble.albums &&
                      scrobble.artists &&
                      scrobble.albums.artistUri &&
                      scrobble.tracks.artistUri &&
                      scrobble.tracks.albumUri &&
                      scrobble.scrobbles
                        ? pipe(
                            publishScrobble(ctx, scrobble.scrobbles.id),
                            Effect.tap(() =>
                              Effect.logInfo("Scrobble published")
                            )
                          )
                        : Effect.succeed(undefined)
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
