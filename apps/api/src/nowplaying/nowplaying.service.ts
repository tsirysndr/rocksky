import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import chalk from "chalk";
import type { Context } from "context";
import dayjs from "dayjs";
import { and, eq, gte, lte, or } from "drizzle-orm";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import { deepSnakeCaseKeys } from "lib";
import { createHash } from "node:crypto";
import type { MusicbrainzTrack, Track } from "types/track";
import albumTracks from "../schema/album-tracks";
import albums from "../schema/albums";
import artistAlbums from "../schema/artist-albums";
import artistTracks from "../schema/artist-tracks";
import artists from "../schema/artists";
import scrobbles from "../schema/scrobbles";
import tracks from "../schema/tracks";
import userAlbums from "../schema/user-albums";
import userArtists from "../schema/user-artists";
import userTracks from "../schema/user-tracks";
import users from "../schema/users";
import tealfm from "../tealfm";

export async function putArtistRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  const record: Artist.Record = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: new Date().toISOString(),
    pictureUrl: track.artistPicture || undefined,
    tags: track.genres || [],
    spotifyId: track.spotifyArtistId || undefined,
    tidalId: track.tidalArtistId || undefined,
    appleMusicId: track.appleMusicArtistId || undefined,
    roles: track.artistRoles || undefined,
  };

  if (!Artist.validateRecord(record).success) {
    console.log(Artist.validateRecord(record));
    console.log(JSON.stringify(record, null, 2));
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
    console.log(`Artist record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating artist record", e);
    return null;
  }
}

export async function putAlbumRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();

  const record: Album.Record = {
    $type: "app.rocksky.album",
    title: track.album,
    artist: track.albumArtist,
    year: track.year,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
    albumArtUrl: track.albumArt,
    spotifyId: track.spotifyAlbumId || undefined,
    tidalId: track.tidalAlbumId || undefined,
    appleMusicId: track.appleMusicAlbumId || undefined,
  };

  if (!Album.validateRecord(record).success) {
    console.log(Album.validateRecord(record));
    console.log(JSON.stringify(record, null, 2));
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
    console.log(`Album record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating album record", e);
    return null;
  }
}

export async function putSongRecord(
  track: Track,
  agent: Agent
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
    year: track.year,
    albumArtUrl: track.albumArt,
    composer: track.composer ? track.composer : undefined,
    lyrics: track.lyrics ? track.lyrics : undefined,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    copyrightMessage: track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    createdAt: new Date().toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : undefined,
    tidalLink: track.tidalLink ? track.tidalLink : undefined,
    appleMusicLink: track.appleMusicLink ? track.appleMusicLink : undefined,
    lastfmLink: track.lastfmLink ? track.lastfmLink : undefined,
    tags: track.genres || [],
    mbid: track.mbId,
    spotifyId: track.spotifyId || undefined,
    tidalId: track.tidalId || undefined,
    appleMusicId: track.appleMusicId || undefined,
    isrc: track.isrc || undefined,
  };

  if (!Song.validateRecord(record).success) {
    console.log(Song.validateRecord(record));
    console.log(chalk.cyan(JSON.stringify(record, null, 2)));
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
    console.log(`Song record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating song record", e);
    return null;
  }
}

async function putScrobbleRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();

  const record: Scrobble.Record = {
    $type: "app.rocksky.scrobble",
    title: track.title,
    albumArtist: track.albumArtist,
    albumArtUrl: track.albumArt,
    artist: track.artist,
    artists: track.artists === null ? undefined : track.artists,
    album: track.album,
    duration: track.duration,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year,
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
    tidalLink: track.tidalLink ? track.tidalLink : undefined,
    appleMusicLink: track.appleMusicLink ? track.appleMusicLink : undefined,
    lastfmLink: track.lastfmLink ? track.lastfmLink : undefined,
    tags: track.genres || [],
    mbid: track.mbId,
    spotifyId: track.spotifyId || undefined,
    tidalId: track.tidalId || undefined,
    appleMusicId: track.appleMusicId || undefined,
    isrc: track.isrc || undefined,
  };

  if (!Scrobble.validateRecord(record).success) {
    console.log(Scrobble.validateRecord(record));
    console.log(JSON.stringify(record, null, 2));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.scrobble",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Scrobble record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating scrobble record", e);
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
          eq(artistAlbums.artistId, scrobble.artist.id)
        )
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
    2
  );

  ctx.nc.publish(
    "rocksky.scrobble",
    Buffer.from(message.replaceAll("sha_256", "sha256"))
  );

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
    })
  );

  ctx.nc.publish(
    "rocksky.track",
    Buffer.from(trackMessage.replaceAll("sha_256", "sha256"))
  );
}

export async function scrobbleTrack(
  ctx: Context,
  track: Track,
  agent: Agent,
  userDid: string
): Promise<void> {
  // check if scrobble already exists (user did + timestamp)
  const scrobbleTime = dayjs.unix(track.timestamp || dayjs().unix());
  const existingScrobble = await ctx.db
    .select({
      scrobble: scrobbles,
      user: users,
      track: tracks,
    })
    .from(scrobbles)
    .innerJoin(users, eq(scrobbles.userId, users.id))
    .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
    .where(
      and(
        eq(users.did, userDid),
        eq(tracks.title, track.title),
        eq(tracks.artist, track.artist),
        gte(scrobbles.timestamp, scrobbleTime.subtract(60, "seconds").toDate()),
        lte(scrobbles.timestamp, scrobbleTime.add(60, "seconds").toDate())
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existingScrobble) {
    console.log(
      `Scrobble already exists for ${chalk.cyan(track.title)} at ${chalk.cyan(
        scrobbleTime.format("YYYY-MM-DD HH:mm:ss")
      )}`
    );
    return;
  }

  let existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(
      eq(
        tracks.sha256,
        createHash("sha256")
          .update(
            `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
          )
          .digest("hex")
      )
    )
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
            .digest("hex")
        )
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
            .digest("hex")
        )
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

  let { data: mbTrack } = await ctx.musicbrainz.post<MusicbrainzTrack>(
    "/hydrate",
    {
      artist: track.artist.split(",").map((a) => ({ name: a.trim() })),
      name: track.title,
      album: track.album,
    }
  );

  if (!mbTrack?.trackMBID) {
    const response = await ctx.musicbrainz.post<MusicbrainzTrack>("/hydrate", {
      artist: track.artist.split(",").map((a) => ({ name: a.trim() })),
      name: track.title,
    });
    mbTrack = response.data;
  }

  track.mbId = mbTrack?.trackMBID;
  track.artists = mbTrack?.artist?.map((artist) => ({
    mbid: artist.mbid,
    name: artist.name,
  }));

  if (!existingTrack?.uri || !userTrack?.userTrack.uri?.includes(userDid)) {
    await putSongRecord(track, agent);
  }

  const existingAlbum = await ctx.db
    .select()
    .from(albums)
    .where(
      eq(
        albums.sha256,
        createHash("sha256")
          .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
          .digest("hex")
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  let tries = 0;
  while (!existingTrack && tries < 30) {
    console.log(`Song not found, trying again: ${chalk.magenta(tries + 1)}`);
    existingTrack = await ctx.db
      .select()
      .from(tracks)
      .where(
        eq(
          tracks.sha256,
          createHash("sha256")
            .update(
              `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
            )
            .digest("hex")
        )
      )
      .limit(1)
      .then((rows) => rows[0]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    tries += 1;
  }

  if (tries === 30 && !existingTrack) {
    console.log(`Song not found after ${chalk.magenta("30 tries")}`);
  }

  if (existingTrack) {
    console.log(
      `Song found: ${chalk.cyan(existingTrack.id)} - ${track.title}, after ${chalk.magenta(tries)} tries`
    );
  }

  const existingArtist = await ctx.db
    .select()
    .from(artists)
    .where(
      or(
        eq(
          artists.sha256,
          createHash("sha256")
            .update(track.albumArtist.toLowerCase())
            .digest("hex")
        ),
        eq(
          artists.sha256,
          createHash("sha256").update(track.artist.toLowerCase()).digest("hex")
        )
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  const userArtist = await ctx.db
    .select({
      userArtist: userArtists,
      artist: artists,
      user: users,
    })
    .from(userArtists)
    .innerJoin(artists, eq(userArtists.artistId, artists.id))
    .innerJoin(users, eq(userArtists.userId, users.id))
    .where(
      and(eq(artists.id, existingArtist?.id || ""), eq(users.did, userDid))
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingArtist?.uri || !userArtist?.userArtist.uri?.includes(userDid)) {
    await putArtistRecord(track, agent);
  }

  const userAlbum = await ctx.db
    .select({
      userAlbum: userAlbums,
      album: albums,
      user: users,
    })
    .from(userAlbums)
    .innerJoin(albums, eq(userAlbums.albumId, albums.id))
    .innerJoin(users, eq(userAlbums.userId, users.id))
    .where(and(eq(albums.id, existingAlbum?.id || ""), eq(users.did, userDid)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingAlbum?.uri || !userAlbum?.userAlbum.uri?.includes(userDid)) {
    await putAlbumRecord(track, agent);
  }

  tries = 0;
  existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(
      eq(
        tracks.sha256,
        createHash("sha256")
          .update(
            `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
          )
          .digest("hex")
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  while (!existingTrack?.artistUri && !existingTrack?.albumUri && tries < 30) {
    console.log(
      `Artist uri not ready, trying again: ${chalk.magenta(tries + 1)}`
    );
    existingTrack = await ctx.db
      .select()
      .from(tracks)
      .where(
        eq(
          tracks.sha256,
          createHash("sha256")
            .update(
              `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
            )
            .digest("hex")
        )
      )
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
              .digest("hex")
          )
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
              .digest("hex")
          )
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
    console.log(`Artist uri not ready after ${chalk.magenta("30 tries")}`);
  }

  if (existingTrack?.artistUri) {
    console.log(
      `Artist uri ready: ${chalk.cyan(existingTrack.id)} - ${track.title}, after ${chalk.magenta(tries)} tries`
    );
  }

  if (mbTrack?.trackMBID) {
    mbTrack.timestamp = track.timestamp
      ? dayjs.unix(track.timestamp).toISOString()
      : new Date().toISOString();
    // don't await this
    tealfm.publishPlayingNow(agent, mbTrack, Math.floor(track.duration / 1000));
  }

  const scrobbleUri = await putScrobbleRecord(track, agent);

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
      console.log("Scrobble found after ", chalk.magenta(tries + 1), " tries");
      await publishScrobble(ctx, scrobble.scrobble.id);
      console.log("Scrobble published");
      break;
    }
    tries += 1;
    console.log("Scrobble not found, trying again: ", chalk.magenta(tries));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (tries === 30 && !scrobble) {
    console.log(`Scrobble not found after ${chalk.magenta("30 tries")}`);
  }

  ctx.nc.publish("rocksky.user.scrobble.sync", Buffer.from(userDid));
}
