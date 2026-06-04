import {
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconTrash,
  IconUpload,
  IconVinyl,
} from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import ContentLoader from "react-content-loader";
import { Link, useNavigate } from "react-router-dom";
import type { UploadedTrack } from "../../api/uploads";
import type { QueueTrack } from "../../atoms/queue";
import { useArtistQuery } from "../../hooks/useLibrary";
import {
  useDeleteAlbumMutation,
  useDeleteUploadMutation,
  useInfiniteUploadsQuery,
} from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function albumKey(albumArtist: string, album: string) {
  return `${albumArtist}|||${album}`;
}

function parseAtUri(uri: string | null | undefined) {
  if (!uri) return null;
  const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  return m ? { did: m[1], rkey: m[2] } : null;
}

function toQueueTrack(item: UploadedTrack): QueueTrack {
  return {
    uploadId: item.upload.id,
    title: item.track.title,
    artist: item.track.artist,
    albumArtist: item.track.albumArtist,
    album: item.track.album,
    albumArt: item.track.albumArt,
    duration: item.track.duration,
    sha256: item.track.sha256,
    songUri: item.track.uri ?? "",
  };
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
// Artist avatar with picture fetch
// ---------------------------------------------------------------------------

function ArtistAvatar({ artistUri, name }: { artistUri: string | null; name: string }) {
  const parsed = parseAtUri(artistUri);
  const { data } = useArtistQuery(parsed?.did ?? "", parsed?.rkey ?? "");
  const picture = data?.picture ?? null;

  return (
    <div
      className="w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-2xl font-bold"
      style={{ backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)" }}
    >
      {picture ? (
        <img src={picture} alt={name} className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
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

type Tab = "tracks" | "albums" | "artists";

export default function LibraryPage() {
  const navigate = useNavigate();
  const { playNow, playNext, playLast, playNextAll, playLastAll } = useUploadPlayer();
  const [tab, setTab] = useState<Tab>("tracks");
  const deleteUploadMutation = useDeleteUploadMutation();
  const deleteAlbumMutation = useDeleteAlbumMutation();

  // Track action sheet
  const [sheetTrack, setSheetTrack] = useState<UploadedTrack | null>(null);
  // Album action sheet
  const [sheetAlbum, setSheetAlbum] = useState<{
    albumArtist: string;
    album: string;
    albumArt: string | null;
    albumUri: string | null;
    artistUri: string | null;
    tracks: QueueTrack[];
  } | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteUploadsQuery();

  const allTracks: UploadedTrack[] = useMemo(() => data?.pages.flat() ?? [], [data]);

  const albums = useMemo(() => {
    const map = new Map<string, {
      albumArtist: string; album: string; albumArt: string | null;
      albumUri: string | null; artistUri: string | null; count: number;
    }>();
    for (const item of allTracks) {
      const key = albumKey(item.track.albumArtist, item.track.album);
      if (!map.has(key)) {
        map.set(key, {
          albumArtist: item.track.albumArtist,
          album: item.track.album,
          albumArt: item.track.albumArt,
          albumUri: item.track.albumUri ?? null,
          artistUri: item.track.artistUri ?? null,
          count: 0,
        });
      }
      map.get(key)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
  }, [allTracks]);

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; artistUri: string | null; trackCount: number; albumCount: number }>();
    for (const item of allTracks) {
      const name = item.track.albumArtist;
      if (!map.has(name)) map.set(name, { name, artistUri: item.track.artistUri ?? null, trackCount: 0, albumCount: 0 });
      map.get(name)!.trackCount++;
    }
    for (const alb of albums) {
      const e = map.get(alb.albumArtist);
      if (e) e.albumCount++;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allTracks, albums]);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTrackPlay = useCallback(
    (item: UploadedTrack) => {
      const queue = allTracks.map(toQueueTrack);
      const idx = allTracks.findIndex((t) => t.upload.id === item.upload.id);
      playNow(queue, idx >= 0 ? idx : 0);
    },
    [allTracks, playNow],
  );

  const tabCls = (t: Tab) =>
    `flex-1 py-2.5 text-sm font-semibold border-none cursor-pointer transition-colors ${
      tab === t ? "border-b-2" : ""
    }`;

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

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
        {(["tracks", "albums", "artists"] as Tab[]).map((t) => (
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
          {isLoading && Array.from({ length: 8 }).map((_, i) => <TrackSkeleton key={i} />)}
          {!isLoading && allTracks.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-4 px-4">
              <IconVinyl size={48} color="var(--color-text-muted)" />
              <p className="text-center m-0" style={{ color: "var(--color-text-muted)" }}>
                Your library is empty. Upload music to get started.
              </p>
              <Link
                to="/library/upload"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold no-underline"
                style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
              >
                Upload music
              </Link>
            </div>
          )}
          {allTracks.map((item, idx) => (
            <div
              key={item.upload.id}
              className="flex items-center gap-3 px-4 py-2.5 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => handleTrackPlay(item)}
            >
              <span
                className="w-6 text-right text-xs shrink-0 font-variant-numeric tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {idx + 1}
              </span>
              <div
                className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: "var(--color-menu-hover)" }}
              >
                {item.track.albumArt ? (
                  <img src={item.track.albumArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <IconMusic size={16} color="var(--color-text-muted)" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>
                  {item.track.title}
                </p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                  {item.track.artist}{item.track.album ? ` — ${item.track.album}` : ""}
                </p>
              </div>
              <span className="text-xs shrink-0 font-variant-numeric" style={{ color: "var(--color-text-muted)" }}>
                {formatDuration(item.track.duration)}
              </span>
              <button
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg shrink-0"
                style={{ color: "var(--color-text-muted)" }}
                onClick={(e) => { e.stopPropagation(); setSheetTrack(item); }}
              >
                <IconDots size={16} />
              </button>
            </div>
          ))}
          <div ref={sentinelRef} />
          {isFetchingNextPage && <TrackSkeleton />}
        </div>
      )}

      {/* Albums tab */}
      {tab === "albums" && (
        <div className="px-4 pt-4">
          {isLoading && (
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
          {!isLoading && albums.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-3">
              <IconVinyl size={48} color="var(--color-text-muted)" />
              <p className="m-0 text-sm" style={{ color: "var(--color-text-muted)" }}>No albums yet</p>
            </div>
          )}
          {albums.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pb-6">
              {albums.map((alb) => {
                const key = albumKey(alb.albumArtist, alb.album);
                const parsed = parseAtUri(alb.albumUri);
                const albumTracks = allTracks
                  .filter((t) => alb.albumUri ? t.track.albumUri === alb.albumUri : t.track.albumArtist === alb.albumArtist && t.track.album === alb.album)
                  .map(toQueueTrack);
                return (
                  <div
                    key={key}
                    className="cursor-pointer"
                    onClick={() => {
                      if (parsed) navigate(`/library/${parsed.did}/album/${parsed.rkey}`);
                    }}
                  >
                    <div
                      className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center mb-2 relative"
                      style={{ backgroundColor: "var(--color-menu-hover)" }}
                    >
                      {alb.albumArt ? (
                        <img src={alb.albumArt} alt={alb.album} className="w-full h-full object-cover" />
                      ) : (
                        <IconVinyl size={40} color="var(--color-text-muted)" />
                      )}
                      <button
                        className="absolute bottom-2 right-2 w-9 h-9 rounded-full border-none flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSheetAlbum({ ...alb, tracks: albumTracks });
                        }}
                      >
                        <IconDots size={16} color="#fff" />
                      </button>
                    </div>
                    <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{alb.album}</p>
                    <p className="text-xs truncate m-0 mt-0.5" style={{ color: "var(--color-text-muted)" }}>{alb.albumArtist}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Artists tab */}
      {tab === "artists" && (
        <div className="px-4 pt-4">
          {isLoading && (
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
          {!isLoading && artists.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-3">
              <IconMusic size={48} color="var(--color-text-muted)" />
              <p className="m-0 text-sm" style={{ color: "var(--color-text-muted)" }}>No artists yet</p>
            </div>
          )}
          {artists.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pb-6">
              {artists.map((art) => {
                const parsed = parseAtUri(art.artistUri);
                return (
                  <div
                    key={art.name}
                    className="flex flex-col items-center gap-2 cursor-pointer py-2"
                    onClick={() => {
                      if (parsed) navigate(`/library/${parsed.did}/artist/${parsed.rkey}`);
                    }}
                    style={{ opacity: parsed ? 1 : 0.5 }}
                  >
                    <ArtistAvatar artistUri={art.artistUri} name={art.name} />
                    <p className="text-sm font-semibold text-center truncate m-0 w-full px-2" style={{ color: "var(--color-text)" }}>
                      {art.name}
                    </p>
                    <p className="text-xs text-center m-0" style={{ color: "var(--color-text-muted)" }}>
                      {art.albumCount} album{art.albumCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Track action sheet */}
      <ActionSheet open={!!sheetTrack} onClose={() => setSheetTrack(null)}>
        {sheetTrack && (
          <>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                {sheetTrack.track.albumArt
                  ? <img src={sheetTrack.track.albumArt} alt="" className="w-full h-full object-cover" />
                  : <IconMusic size={16} color="var(--color-text-muted)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetTrack.track.title}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetTrack.track.artist}</p>
              </div>
            </div>
            <SheetItem icon={<IconPlayerPlay size={16} />} label="Play" onClick={() => { handleTrackPlay(sheetTrack); setSheetTrack(null); }} />
            <SheetItem label="Play next" onClick={() => { playNext(toQueueTrack(sheetTrack)); setSheetTrack(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLast(toQueueTrack(sheetTrack)); setSheetTrack(null); }} />
            {parseAtUri(sheetTrack.track.albumUri) && (
              <SheetItem label="Go to album" onClick={() => {
                const p = parseAtUri(sheetTrack.track.albumUri)!;
                navigate(`/library/${p.did}/album/${p.rkey}`);
                setSheetTrack(null);
              }} />
            )}
            {parseAtUri(sheetTrack.track.artistUri) && (
              <SheetItem label="Go to artist" onClick={() => {
                const p = parseAtUri(sheetTrack.track.artistUri)!;
                navigate(`/library/${p.did}/artist/${p.rkey}`);
                setSheetTrack(null);
              }} />
            )}
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Delete track"
              danger
              disabled={deleteUploadMutation.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete "${sheetTrack.track.title}" from your library? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                deleteUploadMutation.mutate(sheetTrack.upload.id);
                setSheetTrack(null);
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
                {sheetAlbum.albumArt
                  ? <img src={sheetAlbum.albumArt} alt="" className="w-full h-full object-cover" />
                  : <IconVinyl size={16} color="var(--color-text-muted)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetAlbum.album}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetAlbum.albumArtist}</p>
              </div>
            </div>
            <SheetItem icon={<IconPlayerPlay size={16} />} label="Play" onClick={() => { playNow(sheetAlbum.tracks); setSheetAlbum(null); }} />
            <SheetItem icon={<IconArrowsShuffle size={16} />} label="Shuffle" onClick={() => { playNow([...sheetAlbum.tracks].sort(() => Math.random() - 0.5)); setSheetAlbum(null); }} />
            <SheetItem label="Play next" onClick={() => { playNextAll(sheetAlbum.tracks); setSheetAlbum(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLastAll(sheetAlbum.tracks); setSheetAlbum(null); }} />
            {sheetAlbum.artistUri && parseAtUri(sheetAlbum.artistUri) && (
              <SheetItem label="Go to artist" onClick={() => {
                const p = parseAtUri(sheetAlbum.artistUri!)!;
                navigate(`/library/${p.did}/artist/${p.rkey}`);
                setSheetAlbum(null);
              }} />
            )}
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Delete album"
              danger
              disabled={deleteAlbumMutation.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete every track from "${sheetAlbum.album}" by ${sheetAlbum.albumArtist}? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                deleteAlbumMutation.mutate(
                  sheetAlbum.albumUri
                    ? { albumUri: sheetAlbum.albumUri }
                    : { albumArtist: sheetAlbum.albumArtist, albumName: sheetAlbum.album },
                );
                setSheetAlbum(null);
              }}
            />
          </>
        )}
      </ActionSheet>
    </Main>
  );
}
