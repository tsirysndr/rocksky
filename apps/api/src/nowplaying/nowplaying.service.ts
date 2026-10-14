import { createHash } from "node:crypto";
import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import dayjs from "dayjs";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import { deepSnakeCaseKeys, withFallbackAlbumArt } from "lib";
import { bumpAllFeedVersions, bumpScrobblesVersion } from "lib/feedCache";
import { ownsRecord, putRecordOnce } from "lib/recordOwnership";
import {
  assertNotBotFlagged,
  assertNotScrobbleBlocked,
  recordScrobbleAndGuard,
} from "lib/scrobbleGuard";
import { invalidateStats } from "lib/statsCache";
import { reserveScrobble } from "lib/scrobbleDedup";
import { matchTrack, matchingRequest, candidateMetadata } from "lib/matching";
import type { MusicbrainzTrack, Track } from "types/track";
import albumTracks from "../schema/album-tracks";
import albums from "../schema/albums";
import artistAlbums from "../schema/artist-albums";
import artistTracks from "../schema/artist-tracks";
import artists from "../schema/artists";
import scrobbles from "../schema/scrobbles";
import tracks from "../schema/tracks";

// Persistence deduplication uses the exact submitted identity. Recording IDs alone
// must never reuse a row from another title, artist, or album.
export function trackLookupWhere(t: {
  title?: string;
  artist?: string;
  album?: string;
  mbId?: string | null;
  isrc?: string | null;
}) {
  const sha = createHash("sha256")
    .update(`${t.title} - ${t.artist} - ${t.album}`.toLowerCase())
    .digest("hex");
  return eq(tracks.sha256, sha);
}
export function trackLookupOrder(_t: unknown) {
  return tracks.id;
}

import userAlbums from "../schema/user-albums";
import userArtists from "../schema/user-artists";
import userTracks from "../schema/user-tracks";
import users from "../schema/users";
import tealfm from "../tealfm";

export async function putArtistRecord(
  track: Track,
  agent: Agent,
): Promise<string | null> {
  const rkey = TID.nextStr();
  const record: Artist.Record = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: new Date().toISOString(),
    pictureUrl: track.artistPicture || undefined,
    tags: track.genres || [],
  };

  if (!Artist.validateRecord(record).success) {
    consola.info(Artist.validateRecord(record));
    consola.info(JSON.stringify(record, null, 2));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.artist",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    consola.info(`Artist record created at ${uri}`);
    return uri;
  } catch (e) {
    consola.error("Error creating artist record", e);
    return null;
  }
}

export async function putAlbumRecord(
  track: Track,
  agent: Agent,
): Promise<string | null> {
  const rkey = TID.nextStr();

  const record = {
    $type: "app.rocksky.album",
    title: track.album,
    artist: track.albumArtist,
    year: track.year === null ? undefined : track.year,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
    albumArtUrl: withFallbackAlbumArt(track.albumArt),
  };

  if (!Album.validateRecord(record).success) {
    consola.info(Album.validateRecord(record));
    consola.info(JSON.stringify(record, null, 2));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.album",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    consola.info(`Album record created at ${uri}`);
    return uri;
  } catch (e) {
    consola.error("Error creating album record", e);
    return null;
  }
}

export async function putSongRecord(
  track: Track,
  agent: Agent,
): Promise<string | null> {
  const rkey = TID.nextStr();

  const record: Song.Record = {
    $type: "app.rocksky.song",
    title: track.title,
    artist: track.artist,
    artists: track.artists === null ? undefined : track.artists,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year === null ? undefined : track.year,
    albumArtUrl: withFallbackAlbumArt(track.albumArt),
    composer: track.composer ? track.composer : undefined,
    lyrics: track.lyrics ? track.lyrics : undefined,
    trackNumber: track.trackNumber ?? undefined,
    discNumber:
      !track.discNumber || track.discNumber === 0 ? 1 : track.discNumber,
    copyrightMessage: track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    createdAt: new Date().toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : undefined,
    tags: track.genres || [],
    mbid: track.mbId ?? undefined,
    isrc: track.isrc ?? undefined,
  };

  if (!Song.validateRecord(record).success) {
    consola.info(Song.validateRecord(record));
    consola.info(chalk.cyan(JSON.stringify(record, null, 2)));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.song",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    consola.info(`Song record created at ${uri}`);
    return uri;
  } catch (e) {
    consola.error("Error creating song record", e);
    return null;
  }
}

async function putScrobbleRecord(
  track: Track,
  agent: Agent,
): Promise<string | null> {
  const rkey = TID.nextStr();

  const record: Scrobble.Record = {
    $type: "app.rocksky.scrobble",
    title: track.title,
    albumArtist: track.albumArtist,
    albumArtUrl: withFallbackAlbumArt(track.albumArt),
    artist: track.artist,
    artists: track.artists === null ? undefined : track.artists,
    album: track.album,
    duration: track.duration,
    trackNumber: track.trackNumber ?? 1,
    discNumber: track.discNumber ? track.discNumber : 1,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year === null ? undefined : track.year,
    composer: track.composer ? track.composer : undefined,
    lyrics: track.lyrics ? track.lyrics : undefined,
    copyrightMessage: track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    // if track.timestamp is not null, set it to the timestamp
    createdAt: track.timestamp
      ? dayjs.unix(track.timestamp).toISOString()
      : new Date().toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : undefined,
    tags: track.genres || [],
    mbid: track.mbId ?? undefined,
    isrc: track.isrc ?? undefined,
  };

  if (!Scrobble.validateRecord(record).success) {
    consola.info(Scrobble.validateRecord(record));
    consola.info(JSON.stringify(record, null, 2));
    throw new Error("Invalid record");
  }

  let agentDid: string | undefined;
  try {
    agentDid = agent.assertDid;
  } catch {
    consola.error(
      "putScrobbleRecord: agent has no session/DID — ATProto putRecord will fail",
    );
    return null;
  }

  consola.debug(
    `putScrobbleRecord: posting for agent DID ${chalk.cyan(agentDid)}, title="${record.title}"`,
  );

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agentDid,
      collection: "app.rocksky.scrobble",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    consola.info(`Scrobble record created at ${uri}`);
    return uri;
  } catch (e) {
    consola.error("Error creating scrobble record", e);
    return null;
  }
}

export async function publishScrobble(ctx: Context, id: string) {
  const scrobble = await ctx.db
    .select({
      scrobble: scrobbles,
      track: tracks,
      album: albums,
      artist: artists,
      user: users,
    })
    .from(scrobbles)
    .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
    .innerJoin(albums, eq(scrobbles.albumId, albums.id))
    .innerJoin(artists, eq(scrobbles.artistId, artists.id))
    .innerJoin(users, eq(scrobbles.userId, users.id))
    .where(eq(scrobbles.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  const [
    _user_album,
    _user_artist,
    _user_track,
    album_track,
    artist_track,
    artist_album,
  ] = await Promise.all([
    ctx.db
      .select()
      .from(userAlbums)
      .where(eq(userAlbums.albumId, scrobble.album.id))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(userArtists)
      .where(eq(userArtists.artistId, scrobble.artist.id))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(userTracks)
      .where(eq(userTracks.trackId, scrobble.track.id))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.trackId, scrobble.track.id))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(artistTracks)
      .where(eq(artistTracks.trackId, scrobble.track.id))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(artistAlbums)
      .where(
        and(
          eq(artistAlbums.albumId, scrobble.album.id),
          eq(artistAlbums.artistId, scrobble.artist.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  let user_artist = _user_artist;
  if (!user_artist) {
    await ctx.db.insert(userArtists).values({
      userId: scrobble.user.id,
      artistId: scrobble.artist.id,
      uri: scrobble.artist.uri,
      scrobbles: 1,
    });
    user_artist = await ctx.db
      .select()
      .from(userArtists)
      .where(eq(userArtists.artistId, scrobble.artist.id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  let user_album = _user_album;
  if (!user_album) {
    await ctx.db.insert(userAlbums).values({
      userId: scrobble.user.id,
      albumId: scrobble.album.id,
      uri: scrobble.album.uri,
      scrobbles: 1,
    });
    user_album = await ctx.db
      .select()
      .from(userAlbums)
      .where(eq(userAlbums.albumId, scrobble.album.id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  let user_track = _user_track;
  if (!user_track) {
    await ctx.db.insert(userTracks).values({
      userId: scrobble.user.id,
      trackId: scrobble.track.id,
      uri: scrobble.track.uri,
      scrobbles: 1,
    });
    user_track = await ctx.db
      .select()
      .from(userTracks)
      .where(eq(userTracks.trackId, scrobble.track.id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  const message = JSON.stringify(
    deepSnakeCaseKeys({
      scrobble: {
        ...scrobble.scrobble,
        album_id: {
          ...scrobble.album,
          xata_id: scrobble.album.id,
          xata_createdat: scrobble.album.createdAt.toISOString(),
          xata_updatedat: scrobble.album.updatedAt.toISOString(),
        },
        artist_id: {
          ...scrobble.artist,
          xata_id: scrobble.artist.id,
          xata_createdat: scrobble.artist.createdAt.toISOString(),
          xata_updatedat: scrobble.artist.updatedAt.toISOString(),
        },
        track_id: {
          ...scrobble.track,
          xata_id: scrobble.track.id,
          xata_createdat: scrobble.track.createdAt.toISOString(),
          xata_updatedat: scrobble.track.updatedAt.toISOString(),
        },
        user_id: {
          ...scrobble.user,
          xata_id: scrobble.user.id,
          xata_createdat: scrobble.user.createdAt.toISOString(),
          xata_updatedat: scrobble.user.updatedAt.toISOString(),
        },
        xata_id: scrobble.scrobble.id,
        xata_createdat: scrobble.scrobble.createdAt.toISOString(),
        xata_updatedat: scrobble.scrobble.updatedAt.toISOString(),
        timestamp: scrobble.scrobble.timestamp
          ? scrobble.scrobble.timestamp.toISOString()
          : scrobble.scrobble.createdAt.toISOString(),
      },
      user_album: {
        ...user_album,
        album_id: {
          xata_id: scrobble.album.id,
        },
        user_id: {
          xata_id: scrobble.user.id,
        },
        xata_id: user_album.id,
        xata_createdat: user_album.createdAt.toISOString(),
        xata_updatedat: user_album.updatedAt.toISOString(),
      },
      user_artist: {
        ...user_artist,
        artist_id: {
          xata_id: scrobble.artist.id,
        },
        user_id: {
          xata_id: scrobble.user.id,
        },
        xata_id: user_artist.id,
        xata_createdat: user_artist.createdAt.toISOString(),
        xata_updatedat: user_artist.updatedAt.toISOString(),
      },
      user_track: {
        ...user_track,
        track_id: {
          xata_id: scrobble.track.id,
        },
        user_id: {
          xata_id: scrobble.user.id,
        },
        xata_id: user_track.id,
        xata_createdat: user_track.createdAt.toISOString(),
        xata_updatedat: user_track.updatedAt.toISOString(),
      },
      album_track: {
        ...album_track,
        album_id: {
          xata_id: scrobble.album.id,
        },
        track_id: {
          xata_id: scrobble.track.id,
        },
        xata_id: album_track.id,
        xata_createdat: album_track.createdAt.toISOString(),
        xata_updatedat: album_track.updatedAt.toISOString(),
      },
      artist_track: {
        ...artist_track,
        artist_id: {
          xata_id: scrobble.artist.id,
        },
        track_id: {
          xata_id: scrobble.track.id,
        },
        xata_id: artist_track.id,
        xata_createdat: artist_track.createdAt.toISOString(),
        xata_updatedat: artist_track.updatedAt.toISOString(),
      },
      artist_album: {
        ...artist_album,
        artist_id: {
          xata_id: scrobble.artist.id,
        },
        album_id: {
          xata_id: scrobble.album.id,
        },
        xata_id: artist_album.id,
        xata_createdat: artist_album.createdAt.toISOString(),
        xata_updatedat: artist_album.updatedAt.toISOString(),
      },
    }),
    null,
    2,
  );

  ctx.nc.publish(
    "rocksky.scrobble",
    Buffer.from(message.replaceAll("sha_256", "sha256")),
  );

  void bumpAllFeedVersions(ctx);
  void bumpScrobblesVersion(ctx);
  void invalidateStats(ctx, scrobble.user.did, scrobble.user.handle);

  const trackMessage = JSON.stringify(
    deepSnakeCaseKeys({
      track: {
        ...scrobble.track,
        xata_id: scrobble.track.id,
        xata_createdat: scrobble.track.createdAt.toISOString(),
        xata_updatedat: scrobble.track.updatedAt.toISOString(),
      },
      album_track: {
        ...album_track,
        album_id: {
          xata_id: album_track.albumId,
        },
        track_id: {
          xata_id: album_track.trackId,
        },
        xata_id: album_track.id,
        xata_createdat: album_track.createdAt.toISOString(),
        xata_updatedat: album_track.updatedAt.toISOString(),
      },
      artist_track: {
        ...artist_track,
        artist_id: {
          xata_id: artist_track.artistId,
        },
        track_id: {
          xata_id: artist_track.trackId,
        },
        xata_id: artist_track.id,
        xata_createdat: artist_track.createdAt.toISOString(),
        xata_updatedat: artist_track.updatedAt.toISOString(),
      },
      artist_album: {
        ...artist_album,
        artist_id: {
          xata_id: artist_album.artistId,
        },
        album_id: {
          xata_id: artist_album.albumId,
        },
        xata_id: artist_album.id,
        xata_createdat: artist_album.createdAt.toISOString(),
        xata_updatedat: artist_album.updatedAt.toISOString(),
      },
    }),
  );

  ctx.nc.publish(
    "rocksky.track",
    Buffer.from(trackMessage.replaceAll("sha_256", "sha256")),
  );
}

export type ImportCache = {
  artistOps: Map<string, Promise<string | null>>;
  albumOps: Map<string, Promise<string | null>>;
};

export async function scrobbleTrack(
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string,
  skipDupCheck?: boolean,
  importCache?: ImportCache,
): Promise<void> {
  // Capture once: enrichment/polling can take seconds, but the dedup identity
  // and the published record must refer to the same listening time.
  track = { ...track, timestamp: track.timestamp || dayjs().unix() };
  const scrobbleTime = dayjs.unix(track.timestamp);
  const duplicateWindow = skipDupCheck ? 0 : 60;
  const findExistingScrobble = () =>
    ctx.db
      .select({ id: scrobbles.id })
      .from(scrobbles)
      .innerJoin(users, eq(scrobbles.userId, users.id))
      .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
      .where(
        and(
          eq(users.did, userDid),
          sql`lower(${tracks.title}) = ${track.title.toLowerCase()}`,
          sql`lower(${tracks.artist}) = ${track.artist.toLowerCase()}`,
          gte(
            scrobbles.timestamp,
            scrobbleTime.subtract(duplicateWindow, "seconds").toDate(),
          ),
          lte(
            scrobbles.timestamp,
            scrobbleTime.add(duplicateWindow, "seconds").toDate(),
          ),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

  if (!skipDupCheck) {
    await assertNotBotFlagged(ctx, userDid);
    await assertNotScrobbleBlocked(ctx, userDid);
    const existingScrobble = await findExistingScrobble();

    if (existingScrobble) {
      consola.info(
        `Scrobble already exists for ${chalk.cyan(track.title)} at ${chalk.cyan(
          scrobbleTime.format("YYYY-MM-DD HH:mm:ss"),
        )}`,
      );
      return;
    }

    // Genuinely new scrobble — record it in the user's rolling window. Throws
    // ScrobbleBlockedError (and places a temporary block) if the user is
    // scrobbling faster than a human physically can.
    await recordScrobbleAndGuard(ctx, userDid, scrobbleTime.unix());
  }

  let existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(trackLookupWhere(track))
    .orderBy(trackLookupOrder(track))
    .limit(1)
    .then((rows) => rows[0]);

  if (existingTrack && !existingTrack.albumUri) {
    const album = await ctx.db
      .select()
      .from(albums)
      .where(
        eq(
          albums.sha256,
          createHash("sha256")
            .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
            .digest("hex"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (album) {
      await ctx.db
        .update(tracks)
        .set({ albumUri: album.uri })
        .where(eq(tracks.id, existingTrack.id));
    }
  }

  if (existingTrack && !existingTrack.artistUri) {
    const artist = await ctx.db
      .select()
      .from(artists)
      .where(
        eq(
          artists.sha256,
          createHash("sha256")
            .update(track.albumArtist.toLowerCase())
            .digest("hex"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (artist) {
      await ctx.db
        .update(tracks)
        .set({ artistUri: artist.uri })
        .where(eq(tracks.id, existingTrack.id));
    }
  }

  const userTrack = await ctx.db
    .select({
      userTrack: userTracks,
      track: tracks,
      user: users,
    })
    .from(userTracks)
    .innerJoin(tracks, eq(userTracks.trackId, tracks.id))
    .innerJoin(users, eq(userTracks.userId, users.id))
    .where(and(eq(tracks.id, existingTrack?.id || ""), eq(users.did, userDid)))
    .limit(1)
    .then((rows) => rows[0]);

  // Enrich only from the service's selected candidate. Unmatched or ambiguous
  // submissions keep their original metadata; transport failures are observable
  // but must not lose a user's independently supplied scrobble.
  let mbTrack: MusicbrainzTrack | undefined;
  let validatedCatalogId: string | undefined;
  try {
    const candidate = await matchTrack(ctx, matchingRequest(track));
    if (candidate) {
      if (candidate.source === "catalog") validatedCatalogId = candidate.id;
      const metadata = candidateMetadata(candidate);
      track.mbId ??= metadata.mbId;
      if (!track.artists?.length && candidate.musicbrainzArtists?.length)
        track.artists = candidate.musicbrainzArtists;
      track.isrc ??= metadata.isrc;
      track.albumArt ||= metadata.albumArt;
      if (!track.duration || track.duration <= 1)
        track.duration = metadata.duration ?? track.duration;
      track.trackNumber ||= metadata.trackNumber;
      track.discNumber ||= metadata.discNumber;
      track.label ||= metadata.label;
      track.releaseDate ||= metadata.releaseDate;
      track.year ||= metadata.year;
      track.artistPicture ||= metadata.artistPicture;
      if (!track.genres?.length) track.genres = metadata.genres;
      track.spotifyLink ||= metadata.spotifyLink;
      track.deezerLink ||= metadata.deezerLink;
      if (metadata.mbId)
        mbTrack = {
          trackMBID: metadata.mbId,
          releaseMBID: candidate.identifiers.musicbrainzReleaseId ?? "",
          name: candidate.title,
          album: candidate.album ?? track.album,
          artist: (candidate.musicbrainzArtists ?? []).map((a) => ({
            id: a.mbid,
            mbid: a.mbid,
            name: a.name,
          })),
          timestamp: "",
        };
    }
  } catch (error) {
    consola.warn(
      "Matching unavailable; preserving submitted scrobble metadata",
      error instanceof Error ? error.message : error,
    );
  }
  if (!track.duration || track.duration <= 0) track.duration = 1;

  const songSha = createHash("sha256")
    .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
    .digest("hex");
  const artistSha = createHash("sha256")
    .update(track.albumArtist.toLowerCase())
    .digest("hex");
  const albumSha = createHash("sha256")
    .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
    .digest("hex");

  if (!ownsRecord(userTrack?.userTrack.uri, userDid)) {
    await putRecordOnce(ctx.redis, userDid, "app.rocksky.song", songSha, () =>
      putSongRecord(track, agent),
    );
  } else if (existingTrack && !existingTrack.uri) {
    // Ingest lost the global uri (see scripts/backfill-track-uri.ts). This
    // used to be healed by publishing the song again, i.e. a duplicate; the
    // user's own record is the uri we want, so copy it instead.
    await ctx.db
      .update(tracks)
      .set({ uri: userTrack.userTrack.uri })
      .where(and(eq(tracks.id, existingTrack.id), isNull(tracks.uri)))
      .catch((e) =>
        consola.warn(
          `Could not backfill tracks.uri for ${existingTrack.id}`,
          e,
        ),
      );
  }

  const existingAlbum = await ctx.db
    .select()
    .from(albums)
    .where(eq(albums.sha256, albumSha))
    .limit(1)
    .then((rows) => rows[0]);

  let tries = 0;
  while (!existingTrack && tries < 30) {
    consola.info(`Song not found, trying again: ${chalk.magenta(tries + 1)}`);
    existingTrack = await ctx.db
      .select()
      .from(tracks)
      .where(trackLookupWhere(track))
      .orderBy(trackLookupOrder(track))
      .limit(1)
      .then((rows) => rows[0]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    tries += 1;
  }

  if (tries === 30 && !existingTrack) {
    consola.info(`Song not found after ${chalk.magenta("30 tries")}`);
  }

  if (existingTrack) {
    consola.info(
      `Song found: ${chalk.cyan(existingTrack.id)} - ${track.title}, after ${chalk.magenta(tries)} tries`,
    );
  }

  // The artist record is named after the album artist, and that is the row
  // ingest links the user to. Matching the track artist here as well used to
  // pick e.g. "SG Lewis, Clairo" over "SG Lewis", whose link the user never
  // has — so every play of a featuring track published one more "SG Lewis".
  const userArtist = await ctx.db
    .select({ uri: userArtists.uri })
    .from(userArtists)
    .innerJoin(artists, eq(userArtists.artistId, artists.id))
    .innerJoin(users, eq(userArtists.userId, users.id))
    .where(and(eq(artists.sha256, artistSha), eq(users.did, userDid)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!ownsRecord(userArtist?.uri, userDid)) {
    if (importCache) {
      if (!importCache.artistOps.has(artistSha)) {
        importCache.artistOps.set(artistSha, putArtistRecord(track, agent));
      }
      await importCache.artistOps.get(artistSha);
    } else {
      await putRecordOnce(
        ctx.redis,
        userDid,
        "app.rocksky.artist",
        artistSha,
        () => putArtistRecord(track, agent),
      );
    }
  }

  const userAlbum = await ctx.db
    .select({ uri: userAlbums.uri })
    .from(userAlbums)
    .innerJoin(albums, eq(userAlbums.albumId, albums.id))
    .innerJoin(users, eq(userAlbums.userId, users.id))
    .where(and(eq(albums.sha256, albumSha), eq(users.did, userDid)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existingAlbum && !track.albumArt) track.albumArt = existingAlbum.albumArt;

  if (!ownsRecord(userAlbum?.uri, userDid)) {
    if (importCache) {
      if (!importCache.albumOps.has(albumSha)) {
        importCache.albumOps.set(albumSha, putAlbumRecord(track, agent));
      }
      await importCache.albumOps.get(albumSha);
    } else {
      await putRecordOnce(
        ctx.redis,
        userDid,
        "app.rocksky.album",
        albumSha,
        () => putAlbumRecord(track, agent),
      );
    }
  }

  tries = 0;
  existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(trackLookupWhere(track))
    .orderBy(trackLookupOrder(track))
    .limit(1)
    .then((rows) => rows[0]);

  while (!existingTrack?.artistUri && !existingTrack?.albumUri && tries < 30) {
    consola.info(
      `Artist uri not ready, trying again: ${chalk.magenta(tries + 1)}`,
    );
    existingTrack = await ctx.db
      .select()
      .from(tracks)
      .where(trackLookupWhere(track))
      .orderBy(trackLookupOrder(track))
      .limit(1)
      .then((rows) => rows[0]);

    // start update artist uri if it is not set
    if (existingTrack && !existingTrack.artistUri) {
      const artist = await ctx.db
        .select()
        .from(artists)
        .where(
          eq(
            artists.sha256,
            createHash("sha256")
              .update(track.albumArtist.toLowerCase())
              .digest("hex"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (artist) {
        await ctx.db
          .update(tracks)
          .set({ artistUri: artist.uri })
          .where(eq(tracks.id, existingTrack.id));
      }
    }
    // end update artist uri

    // start update album uri if it is not set
    if (existingTrack && !existingTrack.albumUri) {
      const album = await ctx.db
        .select()
        .from(albums)
        .where(
          eq(
            albums.sha256,
            createHash("sha256")
              .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
              .digest("hex"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (album) {
        await ctx.db
          .update(tracks)
          .set({ albumUri: album.uri })
          .where(eq(tracks.id, existingTrack.id));

        if (!album.artistUri && existingTrack?.artistUri) {
          await ctx.db
            .update(albums)
            .set({ artistUri: existingTrack.artistUri })
            .where(eq(albums.id, album.id));
        }
      }
    }
    // end update album uri

    await new Promise((resolve) => setTimeout(resolve, 1000));
    tries += 1;
  }

  if (tries === 30 && !existingTrack?.artistUri) {
    consola.info(`Artist uri not ready after ${chalk.magenta("30 tries")}`);
  }

  if (existingTrack?.artistUri) {
    consola.info(
      `Artist uri ready: ${chalk.cyan(existingTrack.id)} - ${track.title}, after ${chalk.magenta(tries)} tries`,
    );
  }

  if (mbTrack?.trackMBID) {
    mbTrack.timestamp = track.timestamp
      ? dayjs.unix(track.timestamp).toISOString()
      : new Date().toISOString();
    // don't await this
    tealfm.publishPlayingNow(agent, mbTrack, Math.floor(track.duration / 1000));
  }

  // Persistence lookups are not matching decisions. Only enrich from a catalog
  // row that the centralized service explicitly selected for this request.
  if (existingTrack && existingTrack.id === validatedCatalogId) {
    if (track.trackNumber == null)
      track.trackNumber = existingTrack.trackNumber;
    if (track.discNumber == null) track.discNumber = existingTrack.discNumber;
    if (!track.composer) track.composer = existingTrack.composer;
    if (!track.lyrics) track.lyrics = existingTrack.lyrics;
    if (!track.copyrightMessage)
      track.copyrightMessage = existingTrack.copyrightMessage;
    if (!track.mbId) track.mbId = existingTrack.mbId;
    if (!track.isrc) track.isrc = existingTrack.isrc;
    if (!track.genres?.length && existingTrack.genre)
      track.genres = [existingTrack.genre];
    if (!track.spotifyLink) track.spotifyLink = existingTrack.spotifyLink;
    if (!track.albumArt) track.albumArt = existingTrack.albumArt;
  }
  if (existingAlbum) {
    if (track.year == null) track.year = existingAlbum.year;
    if (!track.releaseDate && existingAlbum.releaseDate)
      track.releaseDate = new Date(existingAlbum.releaseDate);
    if (!track.albumArt) track.albumArt = existingAlbum.albumArt;
  }

  // Enrichment may have taken long enough for another request to finish.
  // Recheck persistent history, then atomically reserve the whole time window
  // across API processes. Exact-second keys allow 1–5s concurrent retries.
  if (await findExistingScrobble()) return;
  const reservation = await reserveScrobble(
    ctx.redis,
    userDid,
    {
      title: track.title!,
      artist: track.artist!,
      timestamp: scrobbleTime.unix(),
    },
    duplicateWindow,
  );
  if (!reservation) {
    consola.info(`Concurrent duplicate scrobble skipped for ${track.title}`);
    return;
  }
  // Keep the reservation even on an ambiguous PDS error: the remote write
  // may have succeeded. It expires automatically, allowing a later retry.
  const scrobbleUri = await putScrobbleRecord(track, agent);
  if (!scrobbleUri) throw new Error("Failed to publish scrobble record");

  // loop while scrobble is null, try 30 times, sleep 1 second between tries
  tries = 0;
  let scrobble = null;
  while (!scrobble && tries < 30) {
    scrobble = await ctx.db
      .select({
        scrobble: scrobbles,
        track: tracks,
        album: albums,
        artist: artists,
        user: users,
      })
      .from(scrobbles)
      .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
      .innerJoin(albums, eq(scrobbles.albumId, albums.id))
      .innerJoin(artists, eq(scrobbles.artistId, artists.id))
      .innerJoin(users, eq(scrobbles.userId, users.id))
      .where(eq(scrobbles.uri, scrobbleUri))
      .limit(1)
      .then((rows) => rows[0]);

    if (
      scrobble &&
      scrobble.album &&
      !scrobble.album.artistUri &&
      scrobble.artist.uri
    ) {
      await ctx.db
        .update(albums)
        .set({ artistUri: scrobble.artist.uri })
        .where(eq(albums.id, scrobble.album.id));
    }

    scrobble = await ctx.db
      .select({
        scrobble: scrobbles,
        track: tracks,
        album: albums,
        artist: artists,
        user: users,
      })
      .from(scrobbles)
      .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
      .innerJoin(albums, eq(scrobbles.albumId, albums.id))
      .innerJoin(artists, eq(scrobbles.artistId, artists.id))
      .innerJoin(users, eq(scrobbles.userId, users.id))
      .where(eq(scrobbles.uri, scrobbleUri))
      .limit(1)
      .then((rows) => rows[0]);

    if (
      scrobble &&
      scrobble.track &&
      scrobble.album &&
      scrobble.artist &&
      scrobble.album.artistUri &&
      scrobble.track.artistUri &&
      scrobble.track.albumUri
    ) {
      consola.info("Scrobble found after ", chalk.magenta(tries + 1), " tries");
      await publishScrobble(ctx, scrobble.scrobble.id);
      consola.info("Scrobble published");
      break;
    }
    tries += 1;
    consola.info("Scrobble not found, trying again: ", chalk.magenta(tries));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (tries === 30 && !scrobble) {
    consola.info(`Scrobble not found after ${chalk.magenta("30 tries")}`);
  }

  ctx.nc.publish("rocksky.user.scrobble.sync", Buffer.from(userDid));
}
