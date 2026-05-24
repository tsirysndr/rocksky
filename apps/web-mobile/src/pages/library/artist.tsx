import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconVinyl,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLoader from "react-content-loader";
import type { UploadedTrack } from "../../api/uploads";
import type { QueueTrack } from "../../atoms/queue";
import { useArtistQuery } from "../../hooks/useLibrary";
import { useUploadsQuery } from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

function parseAtUri(uri: string | null | undefined) {
  if (!uri) return null;
  const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  return m ? { did: m[1], rkey: m[2] } : null;
}

// ---------------------------------------------------------------------------
// Action sheet
// ---------------------------------------------------------------------------

function ActionSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl" style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}>
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        {children}
        <button onClick={onClose} className="w-full py-4 text-center border-none bg-transparent cursor-pointer text-sm font-semibold" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
          Cancel
        </button>
      </div>
    </>
  );
}

function SheetItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3.5 border-none bg-transparent cursor-pointer text-left text-sm font-medium" style={{ color: "var(--color-text)" }}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryArtistPage() {
  const navigate = useNavigate();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [sheetTrack, setSheetTrack] = useState<UploadedTrack | null>(null);

  const artistUri = `at://${did}/app.rocksky.artist/${rkey}`;
  const { data: allUploads = [], isLoading } = useUploadsQuery(0, 1000);
  const { data: artistData } = useArtistQuery(did!, rkey!);

  const tracks = useMemo(
    () => allUploads.filter((item) => item.track.artistUri === artistUri),
    [allUploads, artistUri],
  );

  const artistName = artistData?.name ?? tracks[0]?.track.albumArtist ?? "";
  const artistPicture = artistData?.picture ?? null;

  const albums = useMemo(() => {
    const map = new Map<string, { album: string; albumArt: string | null; albumUri: string | null; count: number }>();
    for (const item of tracks) {
      if (!map.has(item.track.album)) {
        map.set(item.track.album, { album: item.track.album, albumArt: item.track.albumArt, albumUri: item.track.albumUri ?? null, count: 0 });
      }
      map.get(item.track.album)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
  }, [tracks]);

  const handlePlayAll = useCallback(() => playNow(tracks.map(toQueueTrack)), [tracks, playNow]);
  const handleShuffle = useCallback(() => playNow([...tracks.map(toQueueTrack)].sort(() => Math.random() - 0.5)), [tracks, playNow]);
  const handleTrackPlay = useCallback((item: UploadedTrack) => {
    const queue = tracks.map(toQueueTrack);
    const idx = tracks.findIndex((t) => t.upload.id === item.upload.id);
    playNow(queue, idx >= 0 ? idx : 0);
  }, [tracks, playNow]);

  if (isLoading) {
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
        {/* Back */}
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
            {artistPicture ? (
              <img src={artistPicture} alt={artistName} className="w-full h-full object-cover" />
            ) : (
              artistName.charAt(0).toUpperCase()
            )}
          </div>
          <h1 className="text-xl font-bold m-0 mb-1" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
            {artistName}
          </h1>
          <p className="text-sm m-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            {albums.length} album{albums.length !== 1 ? "s" : ""} · {tracks.length} track{tracks.length !== 1 ? "s" : ""}
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
                const parsed = parseAtUri(alb.albumUri);
                return (
                  <div
                    key={alb.album}
                    className="cursor-pointer"
                    onClick={() => { if (parsed) navigate(`/library/${parsed.did}/album/${parsed.rkey}`); }}
                  >
                    <div
                      className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center mb-2"
                      style={{ backgroundColor: "var(--color-menu-hover)" }}
                    >
                      {alb.albumArt ? (
                        <img src={alb.albumArt} alt={alb.album} className="w-full h-full object-cover" />
                      ) : (
                        <IconVinyl size={36} color="var(--color-text-muted)" />
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{alb.album}</p>
                    <p className="text-xs m-0 mt-0.5" style={{ color: "var(--color-text-muted)" }}>{alb.count} track{alb.count !== 1 ? "s" : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tracks */}
        <div className="px-4 pt-5">
          <h2 className="text-sm font-bold m-0 mb-1" style={{ color: "var(--color-text)" }}>Tracks</h2>
          {tracks.map((item) => (
            <div
              key={item.upload.id}
              className="flex items-center gap-3 py-3 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => handleTrackPlay(item)}
            >
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
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{item.track.title}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{item.track.album}</p>
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
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
        </div>
      </div>

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
            <SheetItem label="Play" onClick={() => { handleTrackPlay(sheetTrack); setSheetTrack(null); }} />
            <SheetItem label="Play next" onClick={() => { playNext(toQueueTrack(sheetTrack)); setSheetTrack(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLast(toQueueTrack(sheetTrack)); setSheetTrack(null); }} />
            {(() => {
              const parsed = parseAtUri(sheetTrack.track.albumUri);
              return parsed ? (
                <SheetItem label="Go to album" onClick={() => { navigate(`/library/${parsed.did}/album/${parsed.rkey}`); setSheetTrack(null); }} />
              ) : null;
            })()}
          </>
        )}
      </ActionSheet>
    </Main>
  );
}
