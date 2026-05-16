import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import ContentLoader from "react-content-loader";
import numeral from "numeral";
import { IconBrandSpotify } from "@tabler/icons-react";
import { useSongByUriQuery } from "../../hooks/useLibrary";
import { useScrobbleByUriQuery } from "../../hooks/useScrobble";
import Main from "../../layouts/Main";
import ShareOnBluesky from "../../components/ShareOnBluesky";

export default function Song() {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const isScrobble = window.location.pathname.split("/")[2] === "scrobble";

  const scrobbleUri = `at://${did}/app.rocksky.scrobble/${rkey}`;
  const songUri = `at://${did}/app.rocksky.song/${rkey}`;

  const { data: scrobble, isLoading: scrobbleLoading } = useScrobbleByUriQuery(
    isScrobble ? scrobbleUri : "",
  );
  const { data: songData, isLoading: songLoading } = useSongByUriQuery(
    !isScrobble ? songUri : "",
  );

  const song = isScrobble ? scrobble : songData;
  const isLoading = isScrobble ? scrobbleLoading : songLoading;

  const albumHref = song?.albumUri
    ? `/${song.albumUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;
  const artistHref = song?.artistUri
    ? `/${song.artistUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  return (
    <Main>
      <div className="px-4 pb-6 pt-4">
        {isLoading && (
          <ContentLoader
            width="100%"
            height={300}
            viewBox="0 0 400 300"
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
          >
            <rect x="100" y="0" rx="16" ry="16" width="200" height="200" />
            <rect x="50" y="220" rx="4" ry="4" width="300" height="20" />
            <rect x="80" y="252" rx="4" ry="4" width="240" height="14" />
            <rect x="100" y="278" rx="4" ry="4" width="80" height="12" />
          </ContentLoader>
        )}

        {!isLoading && song && (
          <>
            {/* Album art */}
            <div className="flex justify-center mb-6">
              {albumHref ? (
                <Link to={albumHref} className="no-underline block">
                  {song.cover ? (
                    <img
                      src={song.cover}
                      alt={song.title}
                      className="w-56 h-56 rounded-2xl shadow-2xl object-cover"
                    />
                  ) : (
                    <div
                      className="w-56 h-56 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: "var(--color-surface-2)" }}
                    >
                      <span className="text-7xl opacity-20">♪</span>
                    </div>
                  )}
                </Link>
              ) : song.cover ? (
                <img src={song.cover} alt={song.title} className="w-56 h-56 rounded-2xl shadow-2xl object-cover" />
              ) : (
                <div className="w-56 h-56 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  <span className="text-7xl opacity-20">♪</span>
                </div>
              )}
            </div>

            {/* Title & artist */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold m-0 mb-2" style={{ color: "var(--color-text)" }}>
                {song.title}
              </h1>
              {artistHref ? (
                <Link to={artistHref} className="text-base no-underline font-medium" style={{ color: "var(--color-primary)" }}>
                  {song.albumArtist || song.artist}
                </Link>
              ) : (
                <p className="text-base m-0 font-medium" style={{ color: "var(--color-text-muted)" }}>
                  {song.albumArtist || song.artist}
                </p>
              )}
              {albumHref && song.album && (
                <Link to={albumHref} className="text-sm no-underline block mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {song.album}
                </Link>
              )}
            </div>

            {/* Stats */}
            <div
              className="flex justify-center gap-10 py-4 mb-6 rounded-2xl"
              style={{ backgroundColor: "var(--color-surface-2)" }}
            >
              <div className="text-center">
                <p className="font-bold text-lg m-0" style={{ color: "var(--color-text)" }}>
                  {numeral(song.listeners).format("0,0")}
                </p>
                <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Listeners</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-lg m-0" style={{ color: "var(--color-text)" }}>
                  {numeral(song.scrobbles).format("0,0")}
                </p>
                <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Scrobbles</p>
              </div>
            </div>

            {/* Tags */}
            {song.tags && song.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {song.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    to={`/genre/${tag}`}
                    className="text-xs px-3 py-1 rounded-full no-underline"
                    style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-genre)" }}
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Links */}
            <div className="mb-6 flex flex-col gap-3">
              <ShareOnBluesky
                text={`${isScrobble ? "Just scrobbled" : "Listening to"} ${song.title} by ${song.albumArtist || song.artist} on Rocksky 🎵\n${window.location.href}`}
              />
              {song.spotifyLink && (
                <a
                  href={song.spotifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl no-underline font-semibold text-sm"
                  style={{ backgroundColor: "#1DB954", color: "#fff" }}
                >
                  <IconBrandSpotify size={18} />
                  Listen on Spotify
                </a>
              )}
            </div>

            {/* Lyrics */}
            {song.lyrics && (
              <div className="mb-6">
                <h3 className="font-semibold text-base mb-3" style={{ color: "var(--color-text)" }}>Lyrics</h3>
                <p
                  className="text-sm leading-8 m-0"
                  style={{ color: "var(--color-text-muted)", whiteSpace: "pre-line" }}
                >
                  {song.lyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]\s*/g, "")}
                </p>
              </div>
            )}
          </>
        )}

        {!isLoading && !song && (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-6xl mb-4 opacity-20">♪</span>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Song not found</p>
          </div>
        )}
      </div>
    </Main>
  );
}
