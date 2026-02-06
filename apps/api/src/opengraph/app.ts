import { Hono } from "hono";
import { ctx } from "context";
import users from "schema/users";
import albums, { type SelectAlbum } from "schema/albums";
import artists, { type SelectArtist } from "schema/artists";
import tracks, { type SelectTrack } from "schema/tracks";
import scrobbles from "schema/scrobbles";
import { eq, or } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
  const path = c.req.query("path");

  if (!path) {
    return c.text("OG Service: please provide a path query parameter.", 400);
  }

  let m = path.match(/^\/profile\/([^/]+)$/);
  if (m) {
    const handle = decodeURIComponent(m[1]);
    const user = await ctx.db
      .select()
      .from(users)
      .where(or(eq(users.handle, handle), eq(users.did, handle)))
      .limit(1)
      .execute()
      .then(([row]) => row);
    if (!user) {
      return c.text("OG Service: user not found.", 404);
    }
    return c.json({
      title: `@${user.handle} on Rocksky`,
      description:
        "Rocksky user profile — recent scrobbles, top artists, albums, and tracks.",
      image: user.avatar.endsWith("/@jpeg") ? undefined : user.avatar,
      url: `https://rocksky.app/profile/${user.handle}`,
      type: "website",
      twitterCard: "summary_large_image",
    });
  }

  m = path.match(/^\/(did:plc:[^/]+)\/(scrobble|album|artist|song)\/([^/]+)$/);
  if (m) {
    const did = decodeURIComponent(m[1]);
    const kind = m[2] as "scrobble" | "album" | "artist" | "song";
    const rkey = decodeURIComponent(m[3]);
    const uri = `at://${did}/app.rocksky.${kind}/${rkey}`;

    const tableMap = {
      scrobble: scrobbles,
      album: albums,
      artist: artists,
      song: tracks,
    };

    const table = tableMap[kind];
    if (kind === "scrobble") {
      const record = await ctx.db
        .select({
          scrobbles: scrobbles,
          users: users,
          tracks: tracks,
          artists: artists,
          albums: albums,
        })
        .from(table)
        .where(eq(table.uri, uri))
        .leftJoin(users, eq(scrobbles.userId, users.id))
        .leftJoin(tracks, eq(scrobbles.trackId, tracks.id))
        .leftJoin(artists, eq(scrobbles.artistId, artists.id))
        .leftJoin(albums, eq(scrobbles.albumId, albums.id))
        .limit(1)
        .execute()
        .then(([row]) => row);

      if (!record) {
        return c.text("OG Service: record not found.", 404);
      }

      return c.json({
        title: `Scrobble: ${record.tracks.title} by ${record.artists.name}`,
        description: `A listening activity (scrobble) - ${record.tracks.title} - ${record.artists.name} by @${record.users.handle} on Rocksky.`,
        image: record.albums.albumArt,
        url: `https://rocksky.app/${did}/scrobble/${rkey}`,
        type: "website",
        twitterCard: "summary_large_image",
      });
    }

    const record = await ctx.db
      .select()
      .from(table)
      .where(eq(table.uri, uri))
      .limit(1)
      .execute()
      .then(([row]) => row);
    if (!record) {
      return c.text("OG Service: record not found.", 404);
    }

    let title;
    let description;
    let image;
    const url = `https://rocksky.app/${did}/${kind}/${rkey}`;

    if (kind === "album") {
      title = `Album: ${(record as SelectAlbum).title} by ${(record as SelectAlbum).artist}`;
      description = `See listening stats and favorites for ${(record as SelectAlbum).title} by ${(record as SelectAlbum).artist} on Rocksky.`;
      image = (record as SelectAlbum).albumArt;
    }

    if (kind === "artist") {
      title = `Artist: ${(record as SelectArtist).name}`;
      description = `See listening stats and favorites for ${(record as SelectArtist).name} on Rocksky.`;
      image = (record as SelectArtist).picture;
    }

    if (kind === "song") {
      title = `Track: ${(record as SelectTrack).title} by ${(record as SelectTrack).artist}`;
      description = `See listening stats and favorites for ${(record as SelectTrack).title} by ${(record as SelectTrack).artist} on Rocksky.`;
      image = (record as SelectTrack).albumArt;
    }

    return c.json({
      title,
      description,
      image,
      url,
      type: "website",
      twitterCard: "summary_large_image",
    });
  }

  return c.text("OG Service: unsupported path format.", 400);
});

export default app;
