import { Agent, BlobRef } from "@atproto/api";
import { TID } from "@atproto/common";
import { HandlerAuth } from "@atproto/xrpc-server";
import { equals } from "@xata.io/client";
import chalk from "chalk";
import { Context } from "context";
import dayjs from "dayjs";
import { Effect, Match, Option, pipe } from "effect";
import { Server } from "lexicon";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import { InputSchema } from "lexicon/types/app/rocksky/scrobble/createScrobble";
import { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import * as Song from "lexicon/types/app/rocksky/song";
import { createAgent } from "lib/agent";
import downloadImage from "lib/downloadImage";
import { createHash } from "node:crypto";
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

const publishScrobble = (ctx: Context, id: string) =>
  pipe(
    Effect.tryPromise(() =>
      ctx.client.db.scrobbles
        .select(["*", "track_id.*", "album_id.*", "artist_id.*", "user_id.*"])
        .filter("xata_id", equals(id))
        .getFirst()
    ),
    Effect.flatMap((scrobble) =>
      pipe(
        Effect.all([
          Effect.tryPromise(() =>
            ctx.client.db.user_albums
              .select(["*"])
              .filter("album_id.xata_id", equals(scrobble.album_id.xata_id))
              .getFirst()
          ),
          Effect.tryPromise(() =>
            ctx.client.db.user_artists
              .select(["*"])
              .filter("artist_id.xata_id", equals(scrobble.artist_id.xata_id))
              .getFirst()
          ),
          Effect.tryPromise(() =>
            ctx.client.db.user_tracks
              .select(["*"])
              .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
              .getFirst()
          ),
          Effect.tryPromise(() =>
            ctx.client.db.album_tracks
              .select(["*"])
              .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
              .getFirst()
          ),
          Effect.tryPromise(() =>
            ctx.client.db.artist_tracks
              .select(["*"])
              .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
              .getFirst()
          ),
          Effect.tryPromise(() =>
            ctx.client.db.artist_albums
              .select(["*"])
              .filter("album_id.xata_id", equals(scrobble.album_id.xata_id))
              .filter("artist_id.xata_id", equals(scrobble.artist_id.xata_id))
              .getFirst()
          ),
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
              Effect.orElse(() =>
                pipe(
                  Effect.tryPromise(() =>
                    ctx.client.db.user_artists.create({
                      user_id: scrobble.user_id.xata_id,
                      artist_id: scrobble.artist_id.xata_id,
                      uri: scrobble.artist_id.uri,
                      scrobbles: 1,
                    })
                  ),
                  Effect.flatMap(() =>
                    Effect.tryPromise(() =>
                      ctx.client.db.user_artists
                        .select(["*"])
                        .filter(
                          "artist_id.xata_id",
                          equals(scrobble.artist_id.xata_id)
                        )
                        .getFirst()
                    )
                  )
                )
              ),
              Effect.flatMap((finalUserArtist) =>
                pipe(
                  Option.fromNullable(userAlbum),
                  Effect.orElse(() =>
                    pipe(
                      Effect.tryPromise(() =>
                        ctx.client.db.user_albums.create({
                          user_id: scrobble.user_id.xata_id,
                          album_id: scrobble.album_id.xata_id,
                          uri: scrobble.album_id.uri,
                          scrobbles: 1,
                        })
                      ),
                      Effect.flatMap(() =>
                        Effect.tryPromise(() =>
                          ctx.client.db.user_albums
                            .select(["*"])
                            .filter(
                              "album_id.xata_id",
                              equals(scrobble.album_id.xata_id)
                            )
                            .getFirst()
                        )
                      )
                    )
                  ),
                  Effect.flatMap((finalUserAlbum) =>
                    pipe(
                      Option.fromNullable(userTrack),
                      Effect.orElse(() =>
                        pipe(
                          Effect.tryPromise(() =>
                            ctx.client.db.user_tracks.create({
                              user_id: scrobble.user_id.xata_id,
                              track_id: scrobble.track_id.xata_id,
                              uri: scrobble.track_id.uri,
                              scrobbles: 1,
                            })
                          ),
                          Effect.flatMap(() =>
                            Effect.tryPromise(() =>
                              ctx.client.db.user_tracks
                                .select(["*"])
                                .filter(
                                  "track_id.xata_id",
                                  equals(scrobble.track_id.xata_id)
                                )
                                .getFirst()
                            )
                          )
                        )
                      ),
                      Effect.map((finalUserTrack) => ({
                        scrobble,
                        user_album: finalUserAlbum,
                        user_artist: finalUserArtist,
                        user_track: finalUserTrack,
                        album_track: albumTrack,
                        artist_track: artistTrack,
                        artist_album: artistAlbum,
                      }))
                    )
                  )
                )
              ),
              Effect.flatMap((data) =>
                Effect.try(() =>
                  ctx.nc.publish(
                    "rocksky.scrobble",
                    Buffer.from(JSON.stringify(data))
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

const fetchExistingTrack = (ctx: Context, trackHash: string) =>
  Effect.tryPromise(() =>
    ctx.client.db.tracks.filter("sha256", equals(trackHash)).getFirst()
  );

// Update track metadata (album_uri and artist_uri)
const updateTrackMetadata = (ctx: Context, track: Track, trackRecord: any) =>
  pipe(
    Effect.succeed(trackRecord),
    Effect.tap((trackRecord) =>
      !trackRecord.album_uri
        ? pipe(
            computeAlbumHash(track),
            Effect.flatMap((albumHash) =>
              Effect.tryPromise(() =>
                ctx.client.db.albums
                  .filter("sha256", equals(albumHash))
                  .getFirst()
              )
            ),
            Effect.flatMap((album) =>
              album
                ? Effect.tryPromise(() =>
                    ctx.client.db.tracks.update(trackRecord.xata_id, {
                      album_uri: album.uri,
                    })
                  )
                : Effect.succeed(undefined)
            )
          )
        : Effect.succeed(undefined)
    ),
    Effect.tap((trackRecord) =>
      !trackRecord.artist_uri
        ? pipe(
            computeArtistHash(track),
            Effect.flatMap((artistHash) =>
              Effect.tryPromise(() =>
                ctx.client.db.artists
                  .filter("sha256", equals(artistHash))
                  .getFirst()
              )
            ),
            Effect.flatMap((artist) =>
              artist
                ? Effect.tryPromise(() =>
                    ctx.client.db.tracks.update(trackRecord.xata_id, {
                      artist_uri: artist.uri,
                    })
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
  existingTrack: any
) =>
  pipe(
    Option.fromNullable(existingTrack),
    Effect.tap((trackOpt) =>
      Match.value(trackOpt).pipe(
        Match.when(
          (value) => Option.isSome(value),
          () => updateTrackMetadata(ctx, track, trackOpt.value)
        ),
        Match.orElse(() => Effect.succeed(undefined))
      )
    ),
    Effect.flatMap((trackOpt) =>
      pipe(
        Effect.tryPromise(() =>
          ctx.client.db.user_tracks
            .filter({
              "track_id.xata_id": trackOpt?.xata_id,
              "user_id.did": userDid,
            })
            .getFirst()
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
        ctx.client.db.albums.filter("sha256", equals(albumHash)).getFirst()
      )
    ),
    Effect.flatMap((existingAlbum) =>
      pipe(
        Option.fromNullable(existingAlbum),
        Effect.flatMap((album) =>
          Effect.tryPromise(() =>
            ctx.client.db.user_albums
              .filter({
                "album_id.xata_id": album.xata_id,
                "user_id.did": userDid,
              })
              .getFirst()
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
        ctx.client.db.artists.filter("sha256", equals(artistHash)).getFirst()
      )
    ),
    Effect.flatMap((existingArtist) =>
      pipe(
        Option.fromNullable(existingArtist),
        Effect.flatMap((artist) =>
          Effect.tryPromise(() =>
            ctx.client.db.user_artists
              .filter({
                "artist_id.xata_id": artist.xata_id,
                "user_id.did": userDid,
              })
              .getFirst()
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
  track: Track,
  trackHash: string,
  initialTrack: any
) =>
  pipe(
    Effect.iterate(
      { tries: 0, track: initialTrack },
      {
        while: ({ tries, track }) =>
          tries < 30 && !(track?.artist_uri && track?.album_uri),
        body: ({ tries, track }) =>
          pipe(
            Effect.tryPromise(() =>
              ctx.client.db.tracks
                .filter("sha256", equals(trackHash))
                .getFirst()
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
                  ? `Track metadata ready: ${chalk.cyan(trackRecord.xata_id)} - ${track.title}, after ${chalk.magenta(tries + 1)} tries`
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
      tries >= 30 && !(track?.artist_uri && track?.album_uri)
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
      { tries: 0, scrobble: null as any },
      {
        while: ({ tries, scrobble }) =>
          tries < 30 &&
          !(
            scrobble &&
            scrobble.track_id &&
            scrobble.album_id &&
            scrobble.artist_id &&
            scrobble.album_id.artist_uri &&
            scrobble.track_id.artist_uri &&
            scrobble.track_id.album_uri
          ),
        body: ({ tries }) =>
          pipe(
            Effect.tryPromise(() =>
              ctx.client.db.scrobbles
                .select([
                  "*",
                  "track_id.*",
                  "album_id.*",
                  "artist_id.*",
                  "user_id.*",
                ])
                .filter("uri", equals(scrobbleUri))
                .getFirst()
            ),
            Effect.tap((scrobble) =>
              Effect.if(
                !!scrobble &&
                  !!scrobble.album_id &&
                  !scrobble.album_id.artist_uri &&
                  !!scrobble.artist_id.uri,
                {
                  onTrue: () =>
                    Effect.tryPromise(() =>
                      ctx.client.db.albums.update(scrobble.album_id.xata_id, {
                        artist_uri: scrobble.artist_id.uri,
                      })
                    ),
                  onFalse: () => Effect.succeed(undefined),
                }
              )
            ),
            Effect.flatMap(() =>
              Effect.tryPromise(() =>
                ctx.client.db.scrobbles
                  .select([
                    "*",
                    "track_id.*",
                    "album_id.*",
                    "artist_id.*",
                    "user_id.*",
                  ])
                  .filter("uri", equals(scrobbleUri))
                  .getFirst()
              )
            ),
            Effect.map((scrobble) => ({
              tries: tries + 1,
              scrobble,
            })),
            Effect.tap(({ scrobble, tries }) =>
              Effect.logInfo(
                scrobble &&
                  scrobble.track_id &&
                  scrobble.album_id &&
                  scrobble.artist_id &&
                  scrobble.album_id.artist_uri &&
                  scrobble.track_id.artist_uri &&
                  scrobble.track_id.album_uri
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
        scrobble.track_id &&
        scrobble.album_id &&
        scrobble.artist_id &&
        scrobble.album_id.artist_uri &&
        scrobble.track_id.artist_uri &&
        scrobble.track_id.album_uri
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
              retryFetchTrack(ctx, track, trackHash, existingTrack)
            ),
            Effect.flatMap(() =>
              pipe(
                putScrobbleRecord(track, agent),
                Effect.flatMap((scrobbleUri) =>
                  pipe(
                    retryFetchScrobble(ctx, scrobbleUri),
                    Effect.flatMap((scrobble) =>
                      scrobble &&
                      scrobble.track_id &&
                      scrobble.album_id &&
                      scrobble.artist_id &&
                      scrobble.album_id.artist_uri &&
                      scrobble.track_id.artist_uri &&
                      scrobble.track_id.album_uri
                        ? pipe(
                            publishScrobble(ctx, scrobble.xata_id),
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
