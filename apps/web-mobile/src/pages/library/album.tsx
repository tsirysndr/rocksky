import dayjs from "dayjs";
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
import type { UploadedTrack } from "../../api/uploads";
import type { QueueTrack } from "../../atoms/queue";
import { useUploadsQuery } from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";
import ContentLoader from "react-content-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatTotalDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function formatReleaseDate(raw: string | null | undefined, year: number | null | undefined): string | null {
  if (raw) {
    const parts = raw.split("-");
    if (parts.length === 3) { const d = dayjs(raw); if (d.isValid()) return d.format("D MMMM YYYY"); }
    if (parts.length === 2) { const d = dayjs(`${raw}-01`); if (d.isValid()) return d.format("MMMM YYYY"); }
  }
  if (year) return String(year);
  return null;
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
  };
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

export default function LibraryAlbumPage() {
  const navigate = useNavigate();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [sheetTrack, setSheetTrack] = useState<UploadedTrack | null>(null);

  const albumUri = `at://${did}/app.rocksky.album/${rkey}`;
  const { data: allUploads = [], isLoading } = useUploadsQuery(0, 1000);

  const tracks = useMemo(
    () => allUploads
      .filter((item) => item.track.albumUri === albumUri)
      .sort((a, b) => (a.track.trackNumber ?? 0) - (b.track.trackNumber ?? 0)),
    [allUploads, albumUri],
  );

  const albumArt = tracks[0]?.track.albumArt ?? null;
  const album = tracks[0]?.track.album ?? "";
  const albumArtist = tracks[0]?.track.albumArtist ?? "";
  const totalDuration = tracks.reduce((sum, t) => sum + t.track.duration, 0);
  const releaseDate = formatReleaseDate(tracks[0]?.albumReleaseDate, tracks[0]?.albumYear);
  const copyrightMessage = tracks[0]?.track.copyrightMessage ?? null;

  const handlePlay = useCallback(() => playNow(tracks.map(toQueueTrack)), [tracks, playNow]);
  const handleShuffle = useCallback(() => playNow([...tracks.map(toQueueTrack)].sort(() => Math.random() - 0.5)), [tracks, playNow]);
  const handleTrackPlay = useCallback((item: UploadedTrack) => {
    const queue = tracks.map(toQueueTrack);
    const idx = tracks.findIndex((t) => t.upload.id === item.upload.id);
    playNow(queue, idx >= 0 ? idx : 0);
  }, [tracks, playNow]);

  // Parse artist URI for navigation
  const artistParsed = (() => {
    const uri = tracks[0]?.track.artistUri;
    if (!uri) return null;
    const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
    return m ? { did: m[1], rkey: m[2] } : null;
  })();

  if (isLoading) {
    return (
      <Main>
        <div className="px-4 pt-4">
          <button onClick={() => navigate("/library")} className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            <IconArrowLeft size={16} /> Library
          </button>
          <ContentLoader width="100%" height={280} viewBox="0 0 360 280" backgroundColor="var(--color-skeleton-background)" foregroundColor="var(--color-skeleton-foreground)">
            <rect x="0" y="0" rx="16" ry="16" width="140" height="140" />
            <rect x="156" y="8" rx="6" ry="6" width="180" height="22" />
            <rect x="156" y="40" rx="4" ry="4" width="120" height="16" />
            <rect x="156" y="64" rx="3" ry="3" width="90" height="12" />
            <rect x="0" y="160" rx="4" ry="4" width="320" height="14" />
            <rect x="0" y="184" rx="4" ry="4" width="280" height="14" />
            <rect x="0" y="208" rx="4" ry="4" width="300" height="14" />
          </ContentLoader>
        </div>
      </Main>
    );
  }

  return (
    <Main>
      <div className="px-4 pt-4 pb-32">
        {/* Back */}
        <button
          onClick={() => navigate("/library")}
          className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0 mb-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          <IconArrowLeft size={16} /> Library
        </button>

        {/* Album header */}
        <div className="flex gap-4 items-end mb-6">
          <div className="w-36 h-36 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            {albumArt ? (
              <img src={albumArt} alt={album} className="w-full h-full object-cover" />
            ) : (
              <IconVinyl size={56} color="var(--color-text-muted)" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-lg font-bold m-0 mb-1 leading-tight" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
              {album}
            </h1>
            <p
              className="text-sm font-semibold m-0 mb-1 cursor-pointer"
              style={{ color: "var(--color-primary)" }}
              onClick={() => { if (artistParsed) navigate(`/library/${artistParsed.did}/artist/${artistParsed.rkey}`); }}
            >
              {albumArtist}
            </p>
            <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>
              {tracks.length} track{tracks.length !== 1 ? "s" : ""} · {formatTotalDuration(totalDuration)}
            </p>
            <div className="flex gap-3 mt-3">
              <button
                onClick={handlePlay}
                className="flex items-center gap-2 px-5 py-2 rounded-full border-none cursor-pointer text-sm font-semibold"
                style={{ backgroundColor: "var(--color-text)", color: "var(--color-background)" }}
              >
                <IconPlayerPlay size={14} /> Play
              </button>
              <button
                onClick={handleShuffle}
                className="flex items-center gap-2 px-4 py-2 rounded-full border-none cursor-pointer text-sm font-semibold bg-transparent"
                style={{ color: "var(--color-text-muted)" }}
              >
                <IconArrowsShuffle size={14} /> Shuffle
              </button>
            </div>
          </div>
        </div>

        {/* Track list */}
        <div className="flex flex-col">
          {tracks.map((item, idx) => (
            <div
              key={item.upload.id}
              className="flex items-center gap-3 py-3 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => handleTrackPlay(item)}
            >
              <span className="w-6 text-right text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                {item.track.trackNumber ?? idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>
                  {item.track.title}
                </p>
                {item.track.artist !== albumArtist && (
                  <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                    {item.track.artist}
                  </p>
                )}
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

        {/* Release date + copyright */}
        {(releaseDate || copyrightMessage) && (
          <div className="mt-8">
            {releaseDate && (
              <p className="text-sm m-0 mb-1" style={{ color: "var(--color-text-muted)" }}>{releaseDate}</p>
            )}
            {copyrightMessage && (
              <p className="text-xs m-0" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>{copyrightMessage}</p>
            )}
          </div>
        )}
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
            {artistParsed && (
              <SheetItem label="Go to artist" onClick={() => { navigate(`/library/${artistParsed.did}/artist/${artistParsed.rkey}`); setSheetTrack(null); }} />
            )}
          </>
        )}
      </ActionSheet>
    </Main>
  );
}
