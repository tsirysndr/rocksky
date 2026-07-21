import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconPlayerPlay,
  IconVinyl,
} from "@tabler/icons-react";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLoader from "react-content-loader";
import {
  fetchNavidromeAlbum,
  getCoverArtUrl,
  type NavidromeAlbum,
  type NavidromeCredentials,
} from "../../api/navidrome";
import type { QueueTrack } from "../../atoms/queue";
import {
  useNavidromeArtistQuery,
  useNavidromeCredentials,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";

async function fetchAllArtistTracks(
  albums: NavidromeAlbum[],
  creds: NavidromeCredentials,
): Promise<QueueTrack[]> {
  const results = await Promise.all(
    albums.map(async (a) => {
      const full = await fetchNavidromeAlbum(creds, a.id);
      const artUrl = full?.coverArt ? getCoverArtUrl(creds, full.coverArt) : null;
      return (full?.song ?? []).map((s) => songToQueueTrack(s, creds, artUrl));
    }),
  );
  return results.flat();
}

export default function LibraryArtistPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { playNow } = useUploadPlayer();
  const { data: creds } = useNavidromeCredentials();
  const { data: artist, isLoading } = useNavidromeArtistQuery(id ?? "");

  const albums: NavidromeAlbum[] = artist?.album ?? [];

  const handlePlayAll = useCallback(async () => {
    if (!creds) return;
    playNow(await fetchAllArtistTracks(albums, creds));
  }, [albums, creds, playNow]);

  const handleShuffle = useCallback(async () => {
    if (!creds) return;
    const tracks = await fetchAllArtistTracks(albums, creds);
    playNow([...tracks].sort(() => Math.random() - 0.5));
  }, [albums, creds, playNow]);

  if (isLoading || !creds || !artist) {
    return (
      <Main>
        <div className="px-4 pt-4">
          <button onClick={() => navigate("/library")} className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            <IconArrowLeft size={16} /> Library
          </button>
          <ContentLoader width="100%" height={240} viewBox="0 0 360 240" backgroundColor="var(--color-skeleton-background)" foregroundColor="var(--color-skeleton-foreground)">
            <circle cx="180" cy="72" r="64" />
            <rect x="80" y="152" rx="6" ry="6" width="200" height="20" />
            <rect x="120" y="182" rx="4" ry="4" width="120" height="14" />
          </ContentLoader>
        </div>
      </Main>
    );
  }

  return (
    <Main>
      <div className="pb-32">
        <div className="px-4 pt-4 mb-2">
          <button
            onClick={() => navigate("/library")}
            className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            <IconArrowLeft size={16} /> Library
          </button>
        </div>

        {/* Artist header */}
        <div className="flex flex-col items-center px-4 py-6 text-center" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div
            className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center mb-4 text-4xl font-bold"
            style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
          >
            {artist.artistImageUrl ? (
              <img src={artist.artistImageUrl} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              artist.name.charAt(0).toUpperCase()
            )}
          </div>
          <h1 className="text-xl font-bold m-0 mb-1" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
            {artist.name}
          </h1>
          <p className="text-sm m-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            {albums.length} album{albums.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border-none cursor-pointer text-sm font-semibold"
              style={{ backgroundColor: "var(--color-text)", color: "var(--color-background)" }}
            >
              <IconPlayerPlay size={14} /> Play
            </button>
            <button
              onClick={handleShuffle}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border-none cursor-pointer text-sm font-semibold bg-transparent"
              style={{ color: "var(--color-text-muted)" }}
            >
              <IconArrowsShuffle size={14} /> Shuffle
            </button>
          </div>
        </div>

        {/* Albums */}
        {albums.length > 0 && (
          <div className="px-4 pt-5 pb-2">
            <h2 className="text-sm font-bold m-0 mb-3" style={{ color: "var(--color-text)" }}>Albums</h2>
            <div className="grid grid-cols-2 gap-4">
              {albums.map((alb) => {
                const artUrl = alb.coverArt ? getCoverArtUrl(creds, alb.coverArt) : null;
                return (
                  <div
                    key={alb.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/library/album/${alb.id}`)}
                  >
                    <div
                      className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center mb-2"
                      style={{ backgroundColor: "var(--color-menu-hover)" }}
                    >
                      {artUrl ? (
                        <img src={artUrl} alt={alb.name} className="w-full h-full object-cover" />
                      ) : (
                        <IconVinyl size={36} color="var(--color-text-muted)" />
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{alb.name}</p>
                    <p className="text-xs m-0 mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {alb.year ?? `${alb.songCount} track${alb.songCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Main>
  );
}
