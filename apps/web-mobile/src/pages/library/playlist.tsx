import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLoader from "react-content-loader";
import { getCoverArtUrl, type NavidromeSong } from "../../api/navidrome";
import type { QueueTrack } from "../../atoms/queue";
import {
  useNavidromeCredentials,
  useNavidromePlaylistQuery,
  useRemoveTrackFromPlaylistMutation,
  songToQueueTrack,
} from "../../hooks/useNavidrome";
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

export default function LibraryPlaylistPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const { data: creds } = useNavidromeCredentials();
  const { data: playlist, isLoading } = useNavidromePlaylistQuery(id ?? "");
  const removeTrack = useRemoveTrackFromPlaylistMutation();

  const [sheetIdx, setSheetIdx] = useState<number | null>(null);
  const [addToPlaylistSongId, setAddToPlaylistSongId] = useState<string | null>(null);

  const songs: NavidromeSong[] = useMemo(() => playlist?.entry ?? [], [playlist]);
  const totalDuration = playlist?.duration ?? songs.reduce((sum, s) => sum + s.duration, 0);

  const coverUrl = useCallback(
    (coverArt?: string) => (creds && coverArt ? getCoverArtUrl(creds, coverArt) : null),
    [creds],
  );

  const queue = useCallback(
    (): QueueTrack[] => (creds ? songs.map((s) => songToQueueTrack(s, creds, coverUrl(s.coverArt))) : []),
    [creds, songs, coverUrl],
  );

  const handlePlay = useCallback(() => playNow(queue()), [queue, playNow]);
  const handleShuffle = useCallback(() => playNow([...queue()].sort(() => Math.random() - 0.5)), [queue, playNow]);
  const handleTrackPlay = useCallback((idx: number) => playNow(queue(), idx), [queue, playNow]);

  const sheetSong = sheetIdx != null ? songs[sheetIdx] : null;

  if (isLoading || !creds || !playlist) {
    return (
      <Main>
        <div className="px-4 pt-4">
          <button onClick={() => navigate("/library")} className="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer p-0 mb-4" style={{ color: "var(--color-text-muted)" }}>
            <IconArrowLeft size={16} /> Library
          </button>
          <ContentLoader width="100%" height={200} viewBox="0 0 360 200" backgroundColor="var(--color-skeleton-background)" foregroundColor="var(--color-skeleton-foreground)">
            <rect x="0" y="0" rx="16" ry="16" width="120" height="120" />
            <rect x="136" y="16" rx="6" ry="6" width="180" height="20" />
            <rect x="136" y="46" rx="4" ry="4" width="120" height="14" />
          </ContentLoader>
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

        {/* Header */}
        <div className="flex gap-4 items-end mb-6">
          <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--color-menu-hover)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            {coverUrl(playlist.coverArt) ? (
              <img src={coverUrl(playlist.coverArt)!} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <IconPlaylist size={48} color="var(--color-text-muted)" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-lg font-bold m-0 mb-1 leading-tight" style={{ color: "var(--color-text)", fontFamily: "RockfordSansBold" }}>
              {playlist.name}
            </h1>
            <p className="text-xs m-0 mb-3" style={{ color: "var(--color-text-muted)" }}>
              {songs.length} track{songs.length !== 1 ? "s" : ""} · {formatTotalDuration(totalDuration)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handlePlay}
                disabled={songs.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-full border-none cursor-pointer text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--color-text)", color: "var(--color-background)" }}
              >
                <IconPlayerPlay size={14} /> Play
              </button>
              <button
                onClick={handleShuffle}
                disabled={songs.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-full border-none cursor-pointer text-sm font-semibold bg-transparent disabled:opacity-50"
                style={{ color: "var(--color-text-muted)" }}
              >
                <IconArrowsShuffle size={14} /> Shuffle
              </button>
            </div>
          </div>
        </div>

        {/* Track list */}
        {songs.length === 0 ? (
          <p className="text-center text-sm py-16 m-0" style={{ color: "var(--color-text-muted)" }}>
            This playlist is empty.
          </p>
        ) : (
          <div className="flex flex-col">
            {songs.map((song, idx) => (
              <div
                key={`${song.id}-${idx}`}
                className="flex items-center gap-3 py-3 active:opacity-70"
                style={{ borderBottom: "1px solid var(--color-border)" }}
                onClick={() => handleTrackPlay(idx)}
              >
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
                  <p className="text-sm font-semibold truncate m-0" style={{ color: "var(--color-text)" }}>{song.title}</p>
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
                  onClick={(e) => { e.stopPropagation(); setSheetIdx(idx); }}
                >
                  <IconDots size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Track action sheet */}
      <ActionSheet open={sheetIdx != null} onClose={() => setSheetIdx(null)}>
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
            <SheetItem label="Play" onClick={() => { handleTrackPlay(sheetIdx!); setSheetIdx(null); }} />
            <SheetItem label="Play next" onClick={() => { playNext(songToQueueTrack(sheetSong, creds, coverUrl(sheetSong.coverArt))); setSheetIdx(null); }} />
            <SheetItem label="Add to queue" onClick={() => { playLast(songToQueueTrack(sheetSong, creds, coverUrl(sheetSong.coverArt))); setSheetIdx(null); }} />
            <SheetItem icon={<IconPlaylist size={16} />} label="Add to playlist" onClick={() => { setAddToPlaylistSongId(sheetSong.id); setSheetIdx(null); }} />
            {sheetSong.albumId && (
              <SheetItem label="Go to album" onClick={() => { navigate(`/library/album/${sheetSong.albumId}`); setSheetIdx(null); }} />
            )}
            {sheetSong.artistId && (
              <SheetItem label="Go to artist" onClick={() => { navigate(`/library/artist/${sheetSong.artistId}`); setSheetIdx(null); }} />
            )}
            <SheetItem
              icon={<IconTrash size={16} />}
              label="Remove from playlist"
              danger
              disabled={removeTrack.isPending}
              onClick={() => {
                removeTrack.mutate({ playlistId: playlist.id, index: sheetIdx! });
                setSheetIdx(null);
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
