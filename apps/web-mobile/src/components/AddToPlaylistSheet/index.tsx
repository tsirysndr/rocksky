import { IconPlaylist, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import {
  useAddTrackToPlaylistMutation,
  useCreatePlaylistMutation,
  useNavidromePlaylistsQuery,
} from "../../hooks/useNavidrome";

// Bottom sheet for adding a Navidrome song to a playlist — pick an existing
// playlist or create a new one containing the track. Shared by every track
// context menu (library, album, artist, playlist views).

export default function AddToPlaylistSheet({
  open,
  songId,
  onClose,
  onAdded,
}: {
  open: boolean;
  songId: string | null;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const { data: playlists = [], isLoading } = useNavidromePlaylistsQuery();
  const addTrack = useAddTrackToPlaylistMutation();
  const createPlaylist = useCreatePlaylistMutation();
  const [creating, setCreating] = useState(false);

  if (!open || !songId) return null;

  const handleAdd = (playlistId: string) => {
    addTrack.mutate({ playlistId, songId });
    onAdded?.();
    onClose();
  };

  const handleCreate = async () => {
    const name = window.prompt("New playlist name")?.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createPlaylist.mutateAsync({ name, songIds: [songId] });
      onAdded?.();
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          maxHeight: "70vh",
        }}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="m-0 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Add to playlist
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full flex items-center gap-3 px-5 py-3.5 border-none bg-transparent cursor-pointer text-left text-sm font-semibold disabled:opacity-50"
          style={{ color: "var(--color-primary)", borderBottom: "1px solid var(--color-border)" }}
        >
          <IconPlus size={18} /> New playlist
        </button>

        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <p className="text-center text-sm py-6 m-0" style={{ color: "var(--color-text-muted)" }}>
              Loading…
            </p>
          )}
          {!isLoading && playlists.length === 0 && (
            <p className="text-center text-sm py-6 m-0" style={{ color: "var(--color-text-muted)" }}>
              No playlists yet
            </p>
          )}
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => handleAdd(pl.id)}
              className="w-full flex items-center gap-3 px-5 py-3.5 border-none bg-transparent cursor-pointer text-left"
              style={{ color: "var(--color-text)", borderBottom: "1px solid var(--color-border)" }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                <IconPlaylist size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{pl.name}</span>
                <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {pl.songCount} track{pl.songCount !== 1 ? "s" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 text-center border-none bg-transparent cursor-pointer text-sm font-semibold shrink-0"
          style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}
