import { AtpAgent } from "@atproto/api";
import { Record } from "@atproto/api/dist/client/types/com/atproto/repo/listRecords";
import { consola } from "consola";
import { ctx } from "context";
import extractPdsFromDid from "lib/extractPdsFromDid";
import chalk from "chalk";
import * as Song from "lexicon/types/app/rocksky/song";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import schema from "schema";
import { and, eq, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { publishScrobble } from "nowplaying/nowplaying.service";

const args = process.argv.slice(2);

if (args.length === 0) {
  consola.error("Please provide user identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run collections -- <handle|did>")}`);
  process.exit(1);
}

let did: string = args[0];

if (!did.startsWith("did:")) {
  did = await ctx.baseIdResolver.handle.resolve(did);
}

const [user] = await ctx.db
  .select()
  .from(schema.users)
  .where(eq(schema.users.did, did))
  .execute();
if (!user) {
  consola.error(`User with DID ${chalk.cyan(did)} not found in database.`);
  process.exit(1);
}

async function getAtpAgent(did: string): Promise<AtpAgent> {
  const serviceEndpoint = await extractPdsFromDid(did);

  consola.info(`Using service endpoint: ${chalk.cyan(serviceEndpoint)}`);

  return new AtpAgent({ service: serviceEndpoint });
}

async function getScrobbleRecords(agent: AtpAgent, did: string) {
  const records = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.rocksky.scrobble",
      limit: 100,
      cursor,
    });
    records.push(...res.data.records);
    cursor = res.data.cursor;
    consola.info(
      `Fetched ${chalk.greenBright(records.length)} scrobble records so far...`,
    );
  } while (cursor);

  return records;
}

async function getSongRecords(agent: AtpAgent, did: string) {
  const records = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.rocksky.song",
      limit: 100,
      cursor,
    });
    records.push(...res.data.records);
    cursor = res.data.cursor;
    consola.info(
      `Fetched ${chalk.greenBright(records.length)} song records so far...`,
    );
  } while (cursor);

  return records;
}

async function getArtistRecords(agent: AtpAgent, did: string) {
  const records = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.rocksky.artist",
      limit: 100,
      cursor,
    });
    records.push(...res.data.records);
    cursor = res.data.cursor;
    consola.info(
      `Fetched ${chalk.greenBright(records.length)} artist records so far...`,
    );
  } while (cursor);

  return records;
}

async function getAlbumRecords(agent: AtpAgent, did: string) {
  const records = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.rocksky.album",
      limit: 100,
      cursor,
    });
    records.push(...res.data.records);
    cursor = res.data.cursor;
    consola.info(
      `Fetched ${chalk.greenBright(records.length)} album records so far...`,
    );
  } while (cursor);

  return records;
}

async function insertScrobbles(scrobbles: Record[]) {
  await Promise.all(
    scrobbles.map(async (scrobble) => {
      const value: Scrobble.Record = scrobble.value as Scrobble.Record;
      consola.info(
        `Inserting scrobble: ${chalk.greenBright(value.title)} ${chalk.cyan(scrobble.uri)}`,
      );
      const trackSha256 = createHash("sha256")
        .update(
          `${value.title} - ${value.artist} - ${value.album}`.toLowerCase(),
        )
        .digest("hex");
      const albumSha256 = createHash("sha256")
        .update(`${value.album} - ${value.albumArtist}`.toLowerCase())
        .digest("hex");
      const artistSha256 = createHash("sha256")
        .update(value.albumArtist.toLowerCase())
        .digest("hex");

      const [[track], [album], [artist]] = await Promise.all([
        ctx.db
          .select()
          .from(schema.tracks)
          .where(
            value.mbid
              ? or(
                  eq(schema.tracks.mbId, value.mbid),
                  eq(schema.tracks.sha256, trackSha256),
                )
              : eq(schema.tracks.sha256, trackSha256),
          )
          .limit(1)
          .execute(),
        ctx.db
          .select()
          .from(schema.albums)
          .where(eq(schema.albums.sha256, albumSha256))
          .limit(1)
          .execute(),
        ctx.db
          .select()
          .from(schema.artists)
          .where(eq(schema.artists.sha256, artistSha256))
          .limit(1)
          .execute(),
      ]);
      let [newScrobble] = await ctx.db
        .insert(schema.scrobbles)
        .values({
          albumId: album.id,
          trackId: track.id,
          artistId: artist.id,
          uri: scrobble.uri,
          userId: user.id,
          timestamp: new Date(value.createdAt),
          createdAt: new Date(value.createdAt),
        })
        .onConflictDoNothing()
        .returning()
        .execute();

      try {
        if (!newScrobble) {
          [newScrobble] = await ctx.db
            .select()
            .from(schema.scrobbles)
            .where(eq(schema.scrobbles.uri, scrobble.uri))
            .limit(1)
            .execute();
        }
        if (!newScrobble) {
          consola.warn(
            `Scrobble not found after conflict for ${chalk.cyan(value.title)} ${chalk.yellow(
              scrobble.uri,
            )} — skipping publish`,
          );
          return;
        }
        await publishScrobble(ctx, newScrobble.id);
      } catch (err) {
        consola.error(
          `Failed to sync scrobble ${chalk.cyan(newScrobble.id)}:`,
          err,
        );
      }
    }),
  );
}

async function insertSongs(songs: Record[]) {
  await Promise.all(
    songs.map(async (song) => {
      const value: Song.Record = song.value as Song.Record;
      try {
        consola.info(
          `Inserting song: ${chalk.greenBright(value.title)} ${chalk.cyan(song.uri)}`,
        );

        const [[artist], [album]] = await Promise.all([
          ctx.db
            .select()
            .from(schema.artists)
            .where(eq(schema.artists.name, value.albumArtist))
            .limit(1)
            .execute(),
          ctx.db
            .select()
            .from(schema.albums)
            .where(
              and(
                eq(schema.albums.title, value.album),
                eq(schema.albums.artist, value.albumArtist),
              ),
            )
            .limit(1)
            .execute(),
        ]);

        if (!artist) {
          consola.warn(
            `Artist not found for song ${chalk.cyan(value.title)}: ${chalk.yellow(value.albumArtist)} — skipping`,
          );
          return;
        }
        if (!album) {
          consola.warn(
            `Album not found for song ${chalk.cyan(value.title)}: ${chalk.yellow(value.album)} — skipping`,
          );
          return;
        }

        const trackSha256 = createHash("sha256")
          .update(
            `${value.title} - ${value.artist} - ${value.album}`.toLowerCase(),
          )
          .digest("hex");

        let [newTrack] = await ctx.db
          .insert(schema.tracks)
          .values({
            title: value.title,
            artist: value.artist,
            albumArtist: value.albumArtist,
            album: value.album,
            uri: song.uri,
            albumArt: value.albumArtUrl,
            artistUri: artist.uri,
            albumUri: album.uri,
            sha256: trackSha256,
            duration: value.duration,
            mbId: value.mbid,
            trackNumber: value.trackNumber,
            discNumber: value.discNumber,
            composer: value.composer,
            label: value.label,
            lyrics: value.lyrics,
            genre: value.genre,
            copyrightMessage: value.copyrightMessage,
            spotifyLink: value.spotifyLink,
            appleMusicLink: value.appleMusicLink,
            tidalLink: value.tidalLink,
            createdAt: new Date(value.createdAt),
          })
          .onConflictDoNothing()
          .returning()
          .execute();

        if (!newTrack) {
          const [existingTrack] = await ctx.db
            .select()
            .from(schema.tracks)
            .where(
              value.mbid
                ? or(
                    eq(schema.tracks.mbId, value.mbid),
                    eq(schema.tracks.sha256, trackSha256),
                  )
                : eq(schema.tracks.sha256, trackSha256),
            )
            .limit(1)
            .execute();
          newTrack = existingTrack;
          if (!existingTrack) {
            consola.warn(
              `Track not found after conflict for song ${chalk.cyan(value.title)} ${value.mbid} — skipping`,
            );
            return;
          }
        }

        await Promise.all([
          ctx.db
            .insert(schema.userTracks)
            .values({
              userId: user.id,
              trackId: newTrack.id,
              uri: song.uri,
            })
            .onConflictDoNothing()
            .returning()
            .execute(),
          ctx.db
            .insert(schema.albumTracks)
            .values({
              albumId: album.id,
              trackId: newTrack.id,
            })
            .onConflictDoNothing()
            .execute(),
        ]);
      } catch (error) {
        const metadata = `${value.title} - ${value.artist} - ${value.album}`;
        consola.error(
          `Failed to insert song record with URI ${chalk.cyan(metadata)} ${song.uri} ${createHash(
            "sha256",
          )
            .update(
              `${value.title} - ${value.artist} - ${value.album}`.toLowerCase(),
            )
            .digest("hex")}`,
          error,
        );
        consola.info(JSON.stringify(value, null, 2));
      }
    }),
  );
}

async function insertArtists(artists: Record[]) {
  await Promise.all(
    artists.map(async (artist) => {
      const value: Artist.Record = artist.value as Artist.Record;
      consola.info(
        `Inserting artist: ${chalk.greenBright(value.name)} ${chalk.cyan(artist.uri)}`,
      );
      const sha256 = createHash("sha256")
        .update(value.name.toLowerCase())
        .digest("hex");

      let [newArtist] = await ctx.db
        .insert(schema.artists)
        .values({
          uri: artist.uri,
          name: value.name,
          sha256,
          picture: value.pictureUrl,
          genres: value.tags,
          createdAt: new Date(value.createdAt),
        })
        .onConflictDoNothing()
        .returning()
        .execute();

      if (!newArtist) {
        const [existingArtist] = await ctx.db
          .select()
          .from(schema.artists)
          .where(eq(schema.artists.sha256, sha256))
          .limit(1)
          .execute();
        newArtist = existingArtist;
      }

      await ctx.db
        .insert(schema.userArtists)
        .values({
          userId: user.id,
          artistId: newArtist.id,
          uri: artist.uri,
        })
        .onConflictDoNothing()
        .execute();
    }),
  );
}

async function insertAlbums(albums: Record[]) {
  await Promise.all(
    albums.map(async (album) => {
      const value: Album.Record = album.value as Album.Record;
      consola.info(
        `Inserting album: ${chalk.greenBright(value.title)} ${chalk.cyan(album.uri)}`,
      );

      const sha256 = createHash("sha256")
        .update(`${value.title} - ${value.artist}`.toLowerCase())
        .digest("hex");

      let [newAlbum] = await ctx.db
        .insert(schema.albums)
        .values({
          title: value.title,
          artist: value.artist,
          uri: album.uri,
          albumArt: value.albumArtUrl,
          sha256,
          year: value.year,
          releaseDate: value.releaseDate,
        })
        .onConflictDoNothing()
        .returning()
        .execute();

      if (!newAlbum) {
        const [existingAlbum] = await ctx.db
          .select()
          .from(schema.albums)
          .where(eq(schema.albums.sha256, sha256))
          .limit(1)
          .execute();
        newAlbum = existingAlbum;
      }

      const [artist] = await ctx.db
        .select()
        .from(schema.artists)
        .where(eq(schema.artists.name, value.artist))
        .limit(1)
        .execute();

      await Promise.all([
        ctx.db
          .insert(schema.userAlbums)
          .values({
            userId: user.id,
            albumId: newAlbum.id,
            uri: album.uri,
          })
          .onConflictDoNothing()
          .execute(),
        ctx.db
          .insert(schema.artistAlbums)
          .values({
            albumId: newAlbum.id,
            artistId: artist.id,
          })
          .onConflictDoNothing()
          .execute(),
      ]);
    }),
  );
}

async function main() {
  const agent = await getAtpAgent(did);
  const scrobbles = await getScrobbleRecords(agent, did);
  const songs = await getSongRecords(agent, did);
  const artists = await getArtistRecords(agent, did);
  const albums = await getAlbumRecords(agent, did);

  await insertArtists(artists);
  await insertAlbums(albums);
  await insertSongs(songs);
  await insertScrobbles(scrobbles);

  consola.success(`${chalk.cyan(args[0])} Collections fetched successfully!`);

  process.exit(0);
}

await main();
