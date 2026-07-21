import {
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUser,
  IconVinyl,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ContentLoader from "react-content-loader";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchNavidromeAlbum,
  fetchNavidromePlaylist,
  getCoverArtUrl,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromePlaylist,
  type NavidromeSong,
} from "../../api/navidrome";
import type { QueueTrack } from "../../atoms/queue";
import {
  useCreatePlaylistMutation,
  useDeletePlaylistMutation,
  useNavidromeAlbumsQuery,
  useNavidromeArtistsQuery,
  useNavidromeCredentials,
  useNavidromePlaylistsQuery,
  useNavidromeTracksQuery,
  useRenamePlaylistMutation,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import {
  useDeleteAlbumByIdMutation,
  useDeleteUploadByTrackIdMutation,
} from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import AddToPlaylistSheet from "../../components/AddToPlaylistSheet";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Callback-ref sentinel: the observer (re)attaches whenever the sentinel node
// mounts, so infinite scroll works even for tabs mounted lazily after a switch.
function useInfiniteScrollSentinel(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => unknown,
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return setEl;
}

// ---------------------------------------------------------------------------
// Track row skeleton
// ---------------------------------------------------------------------------

function TrackSkeleton() {
  return (
    <ContentLoader
      width="100%"
      height={60}
      viewBox="0 0 360 60"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
      style={{ display: "block" }}
    >
      <rect x="12" y="10" rx="3" ry="3" width="20" height="12" />
      <rect x="44" y="10" rx="8" ry="8" width="40" height="40" />
      <rect x="96" y="13" rx="4" ry="4" width="140" height="13" />
      <rect x="96" y="34" rx="3" ry="3" width="90" height="10" />
      <rect x="308" y="23" rx="3" ry="3" width="36" height="12" />
    </ContentLoader>
  );
}

// ---------------------------------------------------------------------------
// Bottom action sheet
// ---------------------------------------------------------------------------

function ActionSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl pb-safe"
        style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        {children}
        <button
          onClick={onClose}
          className="w-full py-4 text-center border-none bg-transparent cursor-pointer text-sm font-semibold"
          style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function SheetItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? "#e55" : "var(--color-text)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-5 py-3.5 border-none bg-transparent cursor-pointer text-left text-sm font-medium disabled:opacity-50"
      style={{ color }}
    >
      {icon && <span style={{ color: danger ? "#e55" : "var(--color-text-muted)" }}>{icon}</span>}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "tracks" | "albums" | "artists" | "playlists";

export default function LibraryPage() {
  const navigate = useNavigate();
  const { playNow, playNext, playLast, playNextAll, playLastAll } = useUploadPlayer();
  const [tab, setTab] = useState<Tab>("tracks");

  const { data: creds } = useNavidromeCredentials();
  const deleteTrack = useDeleteUploadByTrackIdMutation();
  const deleteAlbum = useDeleteAlbumByIdMutation();
  const createPlaylist = useCreatePlaylistMutation();
  const renamePlaylist = useRenamePlaylistMutation();
  const deletePlaylist = useDeletePlaylistMutation();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState<string | undefined>(undefined);
  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => setSearchQuery(trimmed || undefined), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Action sheets
  const [sheetSong, setSheetSong] = useState<NavidromeSong | null>(null);
  const [sheetAlbum, setSheetAlbum] = useState<NavidromeAlbum | null>(null);
  const [sheetPlaylist, setSheetPlaylist] = useState<NavidromePlaylist | null>(null);
  const [addToPlaylistSongId, setAddToPlaylistSongId] = useState<string | null>(null);

  const tracksQuery = useNavidromeTracksQuery(searchQuery);
  const albumsQuery = useNavidromeAlbumsQuery(searchQuery);
  const artistsQuery = useNavidromeArtistsQuery(searchQuery);
  const playlistsQuery = useNavidromePlaylistsQuery();

  const allSongs: NavidromeSong[] = useMemo(
    () => tracksQuery.data?.pages.flat() ?? [],
    [tracksQuery.data],
  );
  const albums: NavidromeAlbum[] = useMemo(
    () => albumsQuery.data?.pages.flat() ?? [],
    [albumsQuery.data],
  );
  const artists: NavidromeArtist[] = useMemo(
    () => artistsQuery.data ?? [],
    [artistsQuery.data],
  );
  const playlists: NavidromePlaylist[] = useMemo(
    () => playlistsQuery.data ?? [],
    [playlistsQuery.data],
  );

  const tracksSentinelRef = useInfiniteScrollSentinel(
    tracksQuery.hasNextPage ?? false,
    tracksQuery.isFetchingNextPage,
    tracksQuery.fetchNextPage,
  );
  const albumsSentinelRef = useInfiniteScrollSentinel(
    albumsQuery.hasNextPage ?? false,
    albumsQuery.isFetchingNextPage,
    albumsQuery.fetchNextPage,
  );

  const coverUrl = useCallback(
    (coverArt?: string) => (creds && coverArt ? getCoverArtUrl(creds, coverArt) : null),
    [creds],
  );

  const handleTrackPlay = useCallback(
    (idx: number) => {
      if (!creds) return;
      const queue = allSongs.map((s) => songToQueueTrack(s, creds, coverUrl(s.coverArt)));
      playNow(queue, idx >= 0 ? idx : 0);
    },
    [allSongs, creds, coverUrl, playNow],
  );

  const fetchAlbumTracks = useCallback(
    async (album: NavidromeAlbum): Promise<QueueTrack[]> => {
      if (!creds) return [];
      const full = await fetchNavidromeAlbum(creds, album.id);
      const art = coverUrl(full?.coverArt ?? album.coverArt);
      return (full?.song ?? []).map((s) => songToQueueTrack(s, creds, art));
    },
    [creds, coverUrl],
  );

  const fetchPlaylistTracks = useCallback(
    async (playlist: NavidromePlaylist): Promise<QueueTrack[]> => {
      if (!creds) return [];
      const full = await fetchNavidromePlaylist(creds, playlist.id);
      return (full?.entry ?? []).map((s) => songToQueueTrack(s, creds, coverUrl(s.coverArt)));
    },
    [creds, coverUrl],
  );

  const handleCreatePlaylist = useCallback(async () => {
    const name = window.prompt("New playlist name")?.trim();
    if (!name) return;
    await createPlaylist.mutateAsync({ name });
  }, [createPlaylist]);

  const tabCls = (t: Tab) =>
    `flex-1 py-2.5 text-sm font-semibold border-none cursor-pointer transition-colors ${
      tab === t ? "border-b-2" : ""
    }`;

  const tracksLoading = !creds || tracksQuery.isLoading;

  return (
    <Main>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold m-0" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
          My Library
        </h1>
        <Link
          to="/library/upload"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold no-underline"
          style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text)" }}
        >
          <IconUpload size={14} />
          Upload
        </Link>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            <IconSearch size={15} />
          </span>
          <input
            type="text"
            placeholder="Search your library…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full box-border py-2 pl-9 pr-9 rounded-xl text-sm outline-none border-none"
            style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text)" }}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 border-none bg-transparent cursor-pointer rounded-md flex items-center"
              style={{ color: "var(--color-text-muted)" }}
            >
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
        {(["tracks", "albums", "artists", "playlists"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tabCls(t)}
            style={{
              backgroundColor: "transparent",
              color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
              borderColor: tab === t ? "var(--color-primary)" : "transparent",
              borderBottomWidth: tab === t ? "2px" : "0",
              borderBottomStyle: "solid",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tracks tab */}
      {tab === "tracks" && (
        <div>
          {tracksLoading && Array.from({ length: 8 }).map((_, i) => <TrackSkeleton key={i} />)}
          {!tracksLoading && allSongs.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-4 px-4">
              <IconVinyl size={48} color="var(--color-text-muted)" />
              <p className="text-center m-0" style={{ color: "var(--color-text-muted)" }}>
                {searchQuery ? `No results for "${searchQuery}"` : "Your library is empty. Upload music to get started."}
              </p>
              {!searchQuery && (
                <Link
                  to="/library/upload"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold no-underline"
                  style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
                >
                  Upload music
                </Link>
              )}
            </div>
          )}
          {allSongs.map((song, idx) => (
            <div
              key={song.id}
              className="flex items-center gap-3 px-4 py-2.5 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => handleTrackPlay(idx)}
            >
              <span
                className="w-6 text-right text-xs shrink-0 tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {idx + 1}
              </span>
              <div
                className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: "var(--color-menu-hover)" }}
              >
                {coverUrl(song.coverArt) ? (
                  <img src={coverUrl(song.coverArt)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <IconMusic size={16} color="var(--color-text-muted)" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>
                  {song.title}
                </p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                  {song.artist}{song.album ? ` — ${song.album}` : ""}
                </p>
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                {formatDuration(song.duration)}
              </span>
              <button
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg shrink-0"
                style={{ color: "var(--color-text-muted)" }}
                onClick={(e) => { e.stopPropagation(); setSheetSong(song); }}
              >
                <IconDots size={16} />
              </button>
            </div>
          ))}
          <div ref={tracksSentinelRef} />
          {tracksQuery.isFetchingNextPage && <TrackSkeleton />}
        </div>
      )}

      {/* Albums tab */}
      {tab === "albums" && (
        <div className="px-4 pt-4">
          {(albumsQuery.isLoading || !creds) && (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ContentLoader
                  key={i}
                  width="100%"
                  height={180}
                  viewBox="0 0 160 180"
                  backgroundColor="var(--color-skeleton-background)"
                  foregroundColor="var(--color-skeleton-foreground)"
                >
                  <rect x="0" y="0" rx="12" ry="12" width="160" height="140" />
                  <rect x="0" y="148" rx="4" ry="4" width="120" height="13" />
                  <rect x="0" y="167" rx="3" ry="3" width="80" height="10" />
                </ContentLoader>
              ))}
            </div>
          )}
          {!albumsQuery.isLoading && creds && albums.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-3">
              <IconVinyl size={48} color="var(--color-text-muted)" />
              <p className="m-0 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {searchQuery ? `No results for "${searchQuery}"` : "No albums yet"}
              </p>
            </div>
          )}
          {creds && albums.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pb-6">
              {albums.map((alb) => {
                const art = coverUrl(alb.coverArt);
                return (
                  <div
                    key={alb.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/library/album/${alb.id}`)}
                  >
                    <div
                      className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center mb-2 relative"
                      style={{ backgroundColor: "var(--color-menu-hover)" }}
                    >
                      {art ? (
                        <img src={art} alt={alb.name} className="w-full h-full object-cover" />
                      ) : (
                        <IconVinyl size={40} color="var(--color-text-muted)" />
                      )}
                      <button
                        className="absolute bottom-2 right-2 w-9 h-9 rounded-full border-none flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                        onClick={(e) => { e.stopPropagation(); setSheetAlbum(alb); }}
                      >
                        <IconDots size={16} color="#fff" />
                      </button>
                    </div>
                    <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{alb.name}</p>
                    <p className="text-xs truncate m-0 mt-0.5" style={{ color: "var(--color-text-muted)" }}>{alb.artist}</p>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={albumsSentinelRef} />
        </div>
      )}

      {/* Artists tab */}
      {tab === "artists" && (
        <div className="px-4 pt-4">
          {(artistsQuery.isLoading || !creds) && (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ContentLoader
                  key={i}
                  width="100%"
                  height={130}
                  viewBox="0 0 140 130"
                  backgroundColor="var(--color-skeleton-background)"
                  foregroundColor="var(--color-skeleton-foreground)"
                >
                  <circle cx="70" cy="50" r="44" />
                  <rect x="20" y="105" rx="4" ry="4" width="100" height="13" />
                </ContentLoader>
              ))}
            </div>
          )}
          {!artistsQuery.isLoading && creds && artists.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-3">
              <IconUser size={48} color="var(--color-text-muted)" />
              <p className="m-0 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {searchQuery ? `No results for "${searchQuery}"` : "No artists yet"}
              </p>
            </div>
          )}
          {creds && artists.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pb-6">
              {artists.map((art) => (
                <div
                  key={art.id}
                  className="flex flex-col items-center gap-2 cursor-pointer py-2"
                  onClick={() => navigate(`/library/artist/${art.id}`)}
                >
                  <div
                    className="w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-2xl font-bold"
                    style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)" }}
                  >
                    {art.artistImageUrl ? (
                      <img src={art.artistImageUrl} alt={art.name} className="w-full h-full object-cover" />
                    ) : (
                      art.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <p className="text-sm font-semibold text-center truncate m-0 w-full px-2" style={{ color: "var(--color-text)" }}>
                    {art.name}
                  </p>
                  <p className="text-xs text-center m-0" style={{ color: "var(--color-text-muted)" }}>
                    {art.albumCount} album{art.albumCount !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlists tab */}
      {tab === "playlists" && (
        <div className="px-4 pt-4">
          <button
            onClick={handleCreatePlaylist}
            className="w-full flex items-center justify-center gap-2 py-2.5 mb-4 rounded-xl border-none cursor-pointer text-sm font-semibold"
            style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-primary)" }}
          >
            <IconPlus size={16} /> New playlist
          </button>
          {(playlistsQuery.isLoading || !creds) && (
            Array.from({ length: 5 }).map((_, i) => <TrackSkeleton key={i} />)
          )}
          {!playlistsQuery.isLoading && creds && playlists.length === 0 && (
            <div className="flex flex-col items-center py-16 gap-3">
              <IconPlaylist size={48} color="var(--color-text-muted)" />
              <p className="m-0 text-sm" style={{ color: "var(--color-text-muted)" }}>No playlists yet</p>
            </div>
          )}
          {creds && playlists.map((pl) => (
            <div
              key={pl.id}
              className="flex items-center gap-3 py-3 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => navigate(`/library/playlist/${pl.id}`)}
            >
              <div
                className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: "var(--color-menu-hover)" }}
              >
                {coverUrl(pl.coverArt) ? (
                  <img src={coverUrl(pl.coverArt)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <IconPlaylist size={18} color="var(--color-text-muted)" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{pl.name}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                  {pl.songCount} track{pl.songCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg shrink-0"
                style={{ color: "var(--color-text-muted)" }}
                onClick={(e) => { e.stopPropagation(); setSheetPlaylist(pl); }}
              >
                <IconDots size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Track action sheet */}
      <ActionSheet open={!!sheetSong} onClose={() => setSheetSong(null)}>
        {sheetSong && creds && (
          <>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                {coverUrl(sheetSong.coverArt)
                  ? <img src={coverUrl(sheetSong.coverArt)!} alt="" className="w-full h-full object-cover" />
                  : <IconMusic size={16} color="var(--color-text-muted)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetSong.title}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetSong.artist}</p>
              </div>
            </div>
            <SheetItem icon={<IconPlayerPlay size={16} />} label="Play" onClick={() => { const i = allSongs.findIndex((s) => s.id === sheetSong.id); handleTrackPlay(i); setSheetSong(null); }} />
            <SheetItem label="Play next" onClick={() => { playNext(songToQueueTrack(sheetSong, creds, coverUrl(sheetSong.coverArt))); setSheetSong(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLast(songToQueueTrack(sheetSong, creds, coverUrl(sheetSong.coverArt))); setSheetSong(null); }} />
            <SheetItem icon={<IconPlaylist size={16} />} label="Add to playlist" onClick={() => { setAddToPlaylistSongId(sheetSong.id); setSheetSong(null); }} />
            {sheetSong.albumId && (
              <SheetItem label="Go to album" onClick={() => { navigate(`/library/album/${sheetSong.albumId}`); setSheetSong(null); }} />
            )}
            {sheetSong.artistId && (
              <SheetItem label="Go to artist" onClick={() => { navigate(`/library/artist/${sheetSong.artistId}`); setSheetSong(null); }} />
            )}
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Delete track"
              danger
              disabled={deleteTrack.isPending}
              onClick={() => {
                if (!window.confirm(`Delete "${sheetSong.title}" from your library? This cannot be undone.`)) return;
                deleteTrack.mutate(sheetSong.id);
                setSheetSong(null);
              }}
            />
          </>
        )}
      </ActionSheet>

      {/* Album action sheet */}
      <ActionSheet open={!!sheetAlbum} onClose={() => setSheetAlbum(null)}>
        {sheetAlbum && (
          <>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                {coverUrl(sheetAlbum.coverArt)
                  ? <img src={coverUrl(sheetAlbum.coverArt)!} alt="" className="w-full h-full object-cover" />
                  : <IconVinyl size={16} color="var(--color-text-muted)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetAlbum.name}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetAlbum.artist}</p>
              </div>
            </div>
            <SheetItem icon={<IconPlayerPlay size={16} />} label="Play" onClick={async () => { const t = await fetchAlbumTracks(sheetAlbum); playNow(t); setSheetAlbum(null); }} />
            <SheetItem icon={<IconArrowsShuffle size={16} />} label="Shuffle" onClick={async () => { const t = await fetchAlbumTracks(sheetAlbum); playNow([...t].sort(() => Math.random() - 0.5)); setSheetAlbum(null); }} />
            <SheetItem label="Play next" onClick={async () => { const t = await fetchAlbumTracks(sheetAlbum); playNextAll(t); setSheetAlbum(null); }} />
            <SheetItem label="Add to queue" onClick={async () => { const t = await fetchAlbumTracks(sheetAlbum); playLastAll(t); setSheetAlbum(null); }} />
            {sheetAlbum.artistId && (
              <SheetItem label="Go to artist" onClick={() => { navigate(`/library/artist/${sheetAlbum.artistId}`); setSheetAlbum(null); }} />
            )}
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Delete album"
              danger
              disabled={deleteAlbum.isPending}
              onClick={() => {
                if (!window.confirm(`Delete every track from "${sheetAlbum.name}" by ${sheetAlbum.artist}? This cannot be undone.`)) return;
                deleteAlbum.mutate(sheetAlbum.id);
                setSheetAlbum(null);
              }}
            />
          </>
        )}
      </ActionSheet>

      {/* Playlist action sheet */}
      <ActionSheet open={!!sheetPlaylist} onClose={() => setSheetPlaylist(null)}>
        {sheetPlaylist && (
          <>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                <IconPlaylist size={18} color="var(--color-text-muted)" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetPlaylist.name}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetPlaylist.songCount} tracks</p>
              </div>
            </div>
            <SheetItem icon={<IconPlayerPlay size={16} />} label="Play" onClick={async () => { const t = await fetchPlaylistTracks(sheetPlaylist); playNow(t); setSheetPlaylist(null); }} />
            <SheetItem icon={<IconArrowsShuffle size={16} />} label="Shuffle" onClick={async () => { const t = await fetchPlaylistTracks(sheetPlaylist); playNow([...t].sort(() => Math.random() - 0.5)); setSheetPlaylist(null); }} />
            <SheetItem
              label="Rename"
              onClick={async () => {
                const name = window.prompt("Rename playlist", sheetPlaylist.name)?.trim();
                if (name && name !== sheetPlaylist.name) await renamePlaylist.mutateAsync({ id: sheetPlaylist.id, name });
                setSheetPlaylist(null);
              }}
            />
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Delete playlist"
              danger
              disabled={deletePlaylist.isPending}
              onClick={() => {
                if (!window.confirm(`Delete playlist "${sheetPlaylist.name}"? This cannot be undone.`)) return;
                deletePlaylist.mutate(sheetPlaylist.id);
                setSheetPlaylist(null);
              }}
            />
          </>
        )}
      </ActionSheet>

      {/* Add-to-playlist sheet */}
      <AddToPlaylistSheet
        open={!!addToPlaylistSongId}
        songId={addToPlaylistSongId}
        onClose={() => setAddToPlaylistSongId(null)}
      />
    </Main>
  );
}
