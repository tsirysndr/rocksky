import { useParams, Link } from "react-router-dom";
import ContentLoader from "react-content-loader";
import numeral from "numeral";
import { useState } from "react";
import Main from "../../layouts/Main";
import {
  useArtistAlbumsQuery,
  useArtistQuery,
  useArtistRecentListenersQuery,
  useArtistTracksQuery,
} from "../../hooks/useLibrary";
import ShareOnBluesky from "../../components/ShareOnBluesky";
import FloatingShoutBar from "../../components/FloatingShoutBar";
import RecentListeners from "../../components/RecentListeners";

export default function Artist() {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const [tab, setTab] = useState<"tracks" | "albums">("tracks");

  const { data: artist, isLoading } = useArtistQuery(did!, rkey!);
  const { data: tracks } = useArtistTracksQuery(
    artist?.uri || "",
    10,
  );
  const { data: albums } = useArtistAlbumsQuery(
    artist?.uri || "",
    10,
  );
  const {
    data: recentListeners,
    isLoading: recentListenersLoading,
  } = useArtistRecentListenersQuery(artist?.uri || "");

  const artistUri = artist?.uri || `at://${did}/app.rocksky.artist/${rkey}`;

  return (
    <Main>
      <div style={{ paddingBottom: "calc(24px + 56px + env(safe-area-inset-bottom))" }}>
        {isLoading && (
          <ContentLoader
            width="100%"
            height={280}
            viewBox="0 0 400 280"
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
          >
            <circle cx="200" cy="100" r="90" />
            <rect x="100" y="210" rx="4" ry="4" width="200" height="20" />
            <rect x="130" y="242" rx="4" ry="4" width="140" height="14" />
          </ContentLoader>
        )}

        {!isLoading && artist && (
          <>
            {/* Hero */}
            <div className="flex flex-col items-center pt-6 pb-5 px-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-36 h-36 rounded-full overflow-hidden mb-4" style={{ backgroundColor: "var(--color-surface-2)" }}>
                {artist.picture ? (
                  <img src={artist.picture} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl opacity-20">♬</span>
                  </div>
                )}
              </div>

              <h1 className="text-2xl font-bold text-center m-0 mb-3" style={{ color: "var(--color-text)" }}>
                {artist.name}
              </h1>

              <div className="flex gap-8">
                <div className="text-center">
                  <p className="font-bold text-base m-0" style={{ color: "var(--color-text)" }}>
                    {numeral(artist.uniqueListeners || artist.listeners).format("0,0")}
                  </p>
                  <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Listeners</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-base m-0" style={{ color: "var(--color-text)" }}>
                    {numeral(artist.playCount || artist.scrobbles).format("0,0")}
                  </p>
                  <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>Scrobbles</p>
                </div>
              </div>

              {/* Genre tags */}
              {artist.tags && artist.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 justify-center">
                  {artist.tags.slice(0, 5).map((tag: string) => (
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

              <div className="mt-4 w-full px-4">
                <ShareOnBluesky
                  text={`Listening to ${artist.name} on Rocksky 🎵\n${window.location.href}`}
                />
              </div>
            </div>

            {/* Recent Listeners */}
            <div className="px-4 pt-4">
              <RecentListeners
                listeners={recentListeners}
                isLoading={recentListenersLoading}
              />
            </div>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
              {(["tracks", "albums"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-3 text-sm font-medium border-none bg-transparent cursor-pointer capitalize border-b-2"
                  style={{
                    color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
                    borderBottomColor: tab === t ? "var(--color-primary)" : "transparent",
                    borderBottomWidth: "2px",
                    borderBottomStyle: "solid",
                  }}
                >
                  {t === "tracks" ? "Popular Songs" : "Albums"}
                </button>
              ))}
            </div>

            {/* Track list */}
            {tab === "tracks" && (
              <div className="px-4 pt-2">
                {(tracks || []).map((track: Record<string, unknown>, i: number) => {
                  const uri = track.uri as string;
                  const href = uri ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}` : null;
                  return (
                    <div key={String(track.id || i)} className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                      <span className="text-sm w-6 text-center opacity-40" style={{ color: "var(--color-text)" }}>{i + 1}</span>
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((track as any).albumArt || (track as any).album_art || track.cover) ? (
                          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                          <img src={((track as any).albumArt || (track as any).album_art || track.cover) as string} alt={track.title as string} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {href ? (
                          <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{track.title as string}</Link>
                        ) : (
                          <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{track.title as string}</p>
                        )}
                      </div>
                      <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {numeral(track.playCount || track.scrobbles).format("0,0")}
                      </span>
                    </div>
                  );
                })}
                {(!tracks || tracks.length === 0) && (
                  <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No tracks found</p>
                )}
              </div>
            )}

            {/* Album grid */}
            {tab === "albums" && (
              <div className="grid grid-cols-2 gap-3 px-4 pt-4">
                {(albums || []).map((album: Record<string, unknown>, i: number) => {
                  const uri = album.uri as string;
                  const href = uri ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}` : null;
                  return (
                    <div key={String(album.id || i)}>
                      {href ? (
                        <Link to={href} className="no-underline block">
                          <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: "var(--color-surface-2)" }}>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {((album as any).albumArt || (album as any).album_art) ? (
                              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                              <img src={((album as any).albumArt || (album as any).album_art) as string} alt={album.title as string} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><span className="text-4xl opacity-20">💿</span></div>
                            )}
                          </div>
                          <p className="font-semibold text-sm m-0 truncate" style={{ color: "var(--color-text)" }}>{album.title as string}</p>
                        </Link>
                      ) : (
                        <>
                          <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: "var(--color-surface-2)" }}>
                            <div className="w-full h-full flex items-center justify-center"><span className="text-4xl opacity-20">💿</span></div>
                          </div>
                          <p className="font-semibold text-sm m-0 truncate" style={{ color: "var(--color-text)" }}>{album.title as string}</p>
                        </>
                      )}
                    </div>
                  );
                })}
                {(!albums || albums.length === 0) && (
                  <p className="text-sm text-center py-8 col-span-2" style={{ color: "var(--color-text-muted)" }}>No albums found</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <FloatingShoutBar uri={artistUri} type="artist" title={artist?.name} />
    </Main>
  );
}
