import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
  IconTrash,
  IconVinyl,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLoader from "react-content-loader";
import {
  getCoverArtUrl,
  type NavidromeSong,
} from "../../api/navidrome";
import type { QueueTrack } from "../../atoms/queue";
import {
  useNavidromeAlbumQuery,
  useNavidromeCredentials,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
import {
  useDeleteAlbumByIdMutation,
  useDeleteUploadByTrackIdMutation,
} from "../../hooks/useUploads";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import AddToPlaylistSheet from "../../components/AddToPlaylistSheet";
import Main from "../../layouts/Main";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

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

function SheetItem({ label, onClick, icon, danger, disabled }: { label: string; onClick: () => void; icon?: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  const color = danger ? "#e55" : "var(--color-text)";
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3 px-5 py-3.5 border-none bg-transparent cursor-pointer text-left text-sm font-medium disabled:opacity-50" style={{ color }}>
      {icon && <span style={{ color: danger ? "#e55" : "var(--color-text-muted)" }}>{icon}</span>}
      {label}
    </button>
  );
}

export default function LibraryAlbumPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const { data: creds } = useNavidromeCredentials();
  const [sheetSong, setSheetSong] = useState<NavidromeSong | null>(null);
  const [addToPlaylistSongId, setAddToPlaylistSongId] = useState<string | null>(null);
  const deleteTrack = useDeleteUploadByTrackIdMutation();
  const deleteAlbum = useDeleteAlbumByIdMutation();

  const { data: album, isLoading } = useNavidromeAlbumQuery(id ?? "");

  const albumArt = creds && album?.coverArt ? getCoverArtUrl(creds, album.coverArt) : null;
  const songs: NavidromeSong[] = useMemo(() => album?.song ?? [], [album]);
  const totalDuration = album?.duration ?? songs.reduce((sum, s) => sum + s.duration, 0);

  const queue = useCallback(
    (): QueueTrack[] => (creds ? songs.map((s) => songToQueueTrack(s, creds, albumArt)) : []),
    [creds, songs, albumArt],
  );

  const handlePlay = useCallback(() => playNow(queue()), [queue, playNow]);
  const handleShuffle = useCallback(() => playNow([...queue()].sort(() => Math.random() - 0.5)), [queue, playNow]);
  const handleTrackPlay = useCallback((idx: number) => playNow(queue(), idx), [queue, playNow]);

  if (isLoading || !creds) {
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

  if (!album) {
    return (
      <Main>
        <div className="px-4 pt-4">
          <button onClick={() => navigate("/library")} className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            <IconArrowLeft size={16} /> Library
          </button>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Album not found.</p>
        </div>
      </Main>
    );
  }

  return (
    <Main>
      <div className="px-4 pt-4 pb-32">
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
              <img src={albumArt} alt={album.name} className="w-full h-full object-cover" />
            ) : (
              <IconVinyl size={56} color="var(--color-text-muted)" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-lg font-bold m-0 mb-1 leading-tight" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
              {album.name}
            </h1>
            <p
              className="text-sm font-semibold m-0 mb-1 cursor-pointer"
              style={{ color: "var(--color-primary)" }}
              onClick={() => { if (album.artistId) navigate(`/library/artist/${album.artistId}`); }}
            >
              {album.artist}
            </p>
            <p className="text-xs m-0" style={{ color: "var(--color-text-muted)" }}>
              {songs.length} track{songs.length !== 1 ? "s" : ""} · {formatTotalDuration(totalDuration)}
              {album.year ? ` · ${album.year}` : ""}
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
              <button
                disabled={deleteAlbum.isPending || songs.length === 0}
                onClick={() => {
                  if (!window.confirm(`Delete every track from "${album.name}" by ${album.artist}? This cannot be undone.`)) return;
                  deleteAlbum.mutate(album.id, { onSuccess: () => navigate("/library") });
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full border-none cursor-pointer text-sm font-semibold bg-transparent disabled:opacity-50"
                style={{ color: "#e55" }}
              >
                <IconTrash size={14} /> Delete
              </button>
            </div>
          </div>
        </div>

        {/* Track list */}
        <div className="flex flex-col">
          {songs.map((song, idx) => (
            <div
              key={song.id}
              className="flex items-center gap-3 py-3 active:opacity-70"
              style={{ borderBottom: "1px solid var(--color-border)" }}
              onClick={() => handleTrackPlay(idx)}
            >
              <span className="w-6 text-right text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                {song.track ?? idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>
                  {song.title}
                </p>
                {song.artist !== album.artist && (
                  <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
                    {song.artist}
                  </p>
                )}
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
        </div>
      </div>

      {/* Track action sheet */}
      <ActionSheet open={!!sheetSong} onClose={() => setSheetSong(null)}>
        {sheetSong && creds && (
          <>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)" }}>
                {albumArt
                  ? <img src={albumArt} alt="" className="w-full h-full object-cover" />
                  : <IconMusic size={16} color="var(--color-text-muted)" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{sheetSong.title}</p>
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{sheetSong.artist}</p>
              </div>
            </div>
            <SheetItem label="Play" onClick={() => { const i = songs.findIndex((s) => s.id === sheetSong.id); handleTrackPlay(i >= 0 ? i : 0); setSheetSong(null); }} />
            <SheetItem label="Play next" onClick={() => { playNext(songToQueueTrack(sheetSong, creds, albumArt)); setSheetSong(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLast(songToQueueTrack(sheetSong, creds, albumArt)); setSheetSong(null); }} />
            <SheetItem icon={<IconPlaylist size={16} />} label="Add to playlist" onClick={() => { setAddToPlaylistSongId(sheetSong.id); setSheetSong(null); }} />
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

      <AddToPlaylistSheet
        open={!!addToPlaylistSongId}
        songId={addToPlaylistSongId}
        onClose={() => setAddToPlaylistSongId(null)}
      />
    </Main>
  );
}
