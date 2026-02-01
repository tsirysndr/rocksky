import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { renderer } from "./renderer";
import { TopArtistsEmbedPage } from "./embeds/TopArtistsEmbedPage";
import { TopAlbumsEmbedPage } from "./embeds/TopAlbumsEmbedPage";
import { TopTracksEmbedPage } from "./embeds/TopTracksEmbedPage";
import { SongEmbedPage } from "./embeds/SongEmbedPage";
import { ArtistEmbedPage } from "./embeds/ArtistEmbedPage";
import { AlbumEmbedPage } from "./embeds/AlbumEmbedPage";
import { ProfileEmbedPage } from "./embeds/ProfileEmbedPage";
import { NowPlayingEmbedPage } from "./embeds/NowPlayingEmbedPage";
import { RecentScrobblesEmbedPage } from "./embeds/RecentScrobblesEmbedPage";
import { SummaryEmbedPage } from "./embeds/SummaryEmbedPage";
import getProfile from "./xrpc/getProfile";
import getProfileStats from "./xrpc/getStats";
import getTopGenres from "./xrpc/getTopGenres";
import getTopTrack from "./xrpc/getTopTrack";
import getTopArtists from "./xrpc/getTopArtists";
import getTopAlbums from "./xrpc/getTopAlbums";
import getTopTracks from "./xrpc/getTopTracks";
import getRecentScrobbles from "./xrpc/getRecentScrobbles";
import chalk from "chalk";
import { logger } from "hono/logger";
import { ScrobbleEmbedPage } from "./embeds/ScrobbleEmbedPage";
import getScrobble from "./xrpc/getScrobble";
import { Embed } from "./embeds/Embed";

const app = new Hono();

app.use(logger());
app.use("/public/*", serveStatic({ root: "./" }));
app.use(renderer);

app.get("/embed/u/:handle/top/artists", async (c) => {
  const handle = c.req.param("handle");
  const [{ profile, ok: profileOk }, { topArtists, ok: artistsOk }] =
    await Promise.all([getProfile(handle), getTopArtists(handle)]);

  if (!profileOk || !artistsOk) {
    return c.text("Profile not found", 404);
  }

  return c.render(
    <TopArtistsEmbedPage profile={profile} artists={topArtists} />,
  );
});

app.get("/embed/u/:handle/top/albums", async (c) => {
  const handle = c.req.param("handle");
  const [{ profile, ok: profileOk }, { topAlbums, ok: albumsOk }] =
    await Promise.all([getProfile(handle), getTopAlbums(handle)]);
  if (!profileOk || !albumsOk) {
    return c.text("Profile not found", 404);
  }

  return c.render(<TopAlbumsEmbedPage profile={profile} albums={topAlbums} />);
});

app.get("/embed/u/:handle/top/tracks", async (c) => {
  const handle = c.req.param("handle");
  const [{ profile, ok: profileOk }, { topTracks, ok: tracksOk }] =
    await Promise.all([getProfile(handle), getTopTracks(handle)]);

  if (!profileOk || !tracksOk) {
    return c.text("Profile not found", 404);
  }

  return c.render(<TopTracksEmbedPage profile={profile} tracks={topTracks} />);
});

app.get("/embed/:did/song/:rkey", (c) => {
  return c.render(<SongEmbedPage />);
});

app.get("/embed/:did/artist/:rkey", (c) => {
  return c.render(<ArtistEmbedPage />);
});

app.get("/embed/:did/album/:rkey", (c) => {
  return c.render(<AlbumEmbedPage />);
});

app.get("/embed/u/:handle", async (c) => {
  const handle = c.req.param("handle");
  const [
    { profile, ok: profileOk },
    { stats, ok: statsOk },
    { genres, ok: genresOk },
    { topTrack, ok: topTrackOk },
  ] = await Promise.all([
    getProfile(handle),
    getProfileStats(handle),
    getTopGenres(handle),
    getTopTrack(handle),
  ]);

  if (!profileOk || !statsOk || !genresOk || !topTrackOk) {
    return c.text("Profile not found", 404);
  }

  return c.render(
    <ProfileEmbedPage
      handle={profile.handle}
      avatarUrl={profile.avatar || ""}
      displayName={profile.displayName || ""}
      stats={stats}
      genres={genres}
      topTrack={{
        title: topTrack?.title || "Unknown Track",
        artist: topTrack?.artist || "Unknown Artist",
        albumArtist: topTrack?.albumArtist || "Unknown Album Artist",
        trackUrl: `https://rocksky.app/${topTrack?.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`,
        artistUrl: `https://rocksky.app/${topTrack?.artistUri?.split("at://")[1]?.replace("app.rocksky.", "")}`,
        albumCoverUrl: topTrack?.albumArt || "",
        albumUrl: `https://rocksky.app/${topTrack?.albumUri?.split("at://")[1]?.replace("app.rocksky.", "")}`,
      }}
    />,
  );
});

app.get("/embed/u/:handle/now", (c) => {
  return c.render(<NowPlayingEmbedPage />);
});

app.get("/embed/u/:handle/recent", async (c) => {
  const handle = c.req.param("handle");
  const [{ profile, ok: profileOk }, { scrobbles, ok: scrobblesOk }] =
    await Promise.all([getProfile(handle), getRecentScrobbles(handle)]);

  if (!profileOk || !scrobblesOk) {
    return c.text("Profile not found", 404);
  }

  return c.render(
    <RecentScrobblesEmbedPage profile={profile} scrobbles={scrobbles} />,
  );
});

app.get("/embed/u/:handle/summary", (c) => {
  return c.render(<SummaryEmbedPage />);
});

app.get("/embed/:did/scrobble/:rkey", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
  const [{ profile, ok: profileOk }, { scrobble, ok: scrobbleOk }] =
    await Promise.all([getProfile(did), getScrobble(uri)]);

  if (!scrobbleOk || !profileOk || !scrobble) {
    return c.text("Scrobble not found", 404);
  }

  return c.render(<ScrobbleEmbedPage profile={profile} scrobble={scrobble} />);
});

app.get("/", (c) => {
  return c.render(<Embed />);
});

console.log(
  chalk.greenBright(`
    ______          __             __
   / ____/___ ___  / /_  ___  ____/ /
  / __/ / __ \`__ \\/ __ \\/ _ \\/ __  /
 / /___/ / / / / / /_/ /  __/ /_/ /
/_____/_/ /_/ /_/_.___/\\___/\\__,_/
`),
);

const port = process.env.EMBED_PORT ? Number(process.env.EMBED_PORT) : 4001;
console.log(
  chalk.blueBright(
    "🚀  Server is running!" + chalk.whiteBright(` http://localhost:${port}`),
  ),
);

export default {
  port,
  fetch: app.fetch,
};
