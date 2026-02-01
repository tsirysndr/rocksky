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

const app = new Hono();

app.use("/public/*", serveStatic({ root: "./" }));

app.use(renderer);

app.get("/embed/u/:handle/top/artists", (c) => {
  return c.render(<TopArtistsEmbedPage />);
});

app.get("/embed/u/:handle/top/albums", (c) => {
  return c.render(<TopAlbumsEmbedPage />);
});

app.get("/embed/u/:handle/top/tracks", (c) => {
  return c.render(<TopTracksEmbedPage />);
});

app.get("/embed/song/:id", (c) => {
  return c.render(<SongEmbedPage />);
});

app.get("/embed/artist/:id", (c) => {
  return c.render(<ArtistEmbedPage />);
});

app.get("/embed/album/:id", (c) => {
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

app.get("/embed/u/:handle/recent", (c) => {
  return c.render(<RecentScrobblesEmbedPage />);
});

app.get("/embed/u/:handle/summary", (c) => {
  return c.render(<SummaryEmbedPage />);
});

app.get("/", (c) => {
  return c.render(
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-2xl">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Hello from Hono + React!
        </h1>
        <p className="text-gray-600">
          This is server-side rendered with Tailwind CSS
        </p>
      </div>
    </div>,
  );
});

export default app;
