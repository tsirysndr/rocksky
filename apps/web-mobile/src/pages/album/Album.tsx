import { useParams, Link } from "react-router-dom";
import ContentLoader from "react-content-loader";
import numeral from "numeral";
import dayjs from "dayjs";
import Main from "../../layouts/Main";
import { useAlbumQuery } from "../../hooks/useLibrary";

function formatDuration(ms: number) {
  if (!ms) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Album() {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { data: album, isLoading } = useAlbumQuery(did!, rkey!);

  const artistHref = album?.artistUri
    ? `/${album.artistUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  return (
    <Main>
      <div className="pb-6">
        {isLoading && (
          <ContentLoader
            width="100%"
            height={300}
            viewBox="0 0 400 300"
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
          >
            <rect x="100" y="20" rx="16" ry="16" width="200" height="200" />
            <rect x="80" y="240" rx="4" ry="4" width="240" height="18" />
            <rect x="120" y="270" rx="4" ry="4" width="160" height="13" />
          </ContentLoader>
        )}

        {!isLoading && album && (
          <>
            {/* Album art + info */}
            <div className="flex flex-col items-center pt-6 pb-5 px-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl mb-5" style={{ backgroundColor: "var(--color-surface-2)" }}>
                {album.albumArt ? (
                  <img src={album.albumArt} alt={album.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-7xl opacity-20">💿</span>
                  </div>
                )}
              </div>

              <h1 className="text-2xl font-bold text-center m-0 mb-2" style={{ color: "var(--color-text)" }}>
                {album.title}
              </h1>

              {artistHref ? (
                <Link to={artistHref} className="text-base no-underline font-medium mb-1" style={{ color: "var(--color-primary)" }}>
                  {album.artist}
                </Link>
              ) : (
                <p className="text-base m-0 mb-1 font-medium" style={{ color: "var(--color-text-muted)" }}>{album.artist}</p>
              )}

              {album.releaseDate && (
                <p className="text-sm m-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
                  {dayjs(album.releaseDate).format("YYYY")}
                </p>
              )}

              <div className="flex gap-8">
                <div className="text-center">
                  <p className="font-bold text-base m-0" style={{ color: "var(--color-text)" }}>
                    {numeral(album.uniqueListeners || album.listeners).format("0,0")}
                  </p>
                  <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Listeners</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-base m-0" style={{ color: "var(--color-text)" }}>
                    {numeral(album.playCount || album.scrobbles).format("0,0")}
                  </p>
                  <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Scrobbles</p>
                </div>
              </div>

              {album.tags && album.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 justify-center">
                  {album.tags.slice(0, 5).map((tag: string) => (
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
            </div>

            {/* Track listing */}
            <div className="px-4 pt-3">
              <h3 className="font-semibold text-base mb-2" style={{ color: "var(--color-text)" }}>Tracks</h3>
              {(album.tracks || []).map((track: Record<string, unknown>, i: number) => {
                const uri = track.uri as string;
                const href = uri ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}` : null;
                return (
                  <div key={String(track.id || i)} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-sm w-7 text-center opacity-40 shrink-0" style={{ color: "var(--color-text)" }}>
                      {(track.trackNumber as number) || i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      {href ? (
                        <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>
                          {track.title as string}
                        </Link>
                      ) : (
                        <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{track.title as string}</p>
                      )}
                      {!!(track.artist as string) && (
                        <p className="text-xs m-0 truncate" style={{ color: "var(--color-text-muted)" }}>{track.artist as string}</p>
                      )}
                    </div>
                    {!!(track.duration as number) && (
                      <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {formatDuration(track.duration as number)}
                      </span>
                    )}
                  </div>
                );
              })}
              {(!album.tracks || album.tracks.length === 0) && (
                <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No tracks found</p>
              )}
            </div>
          </>
        )}
      </div>
    </Main>
  );
}
