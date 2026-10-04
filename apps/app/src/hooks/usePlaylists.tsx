import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  PlaylistMirrorWarning,
  removeTrackFromPlaylist,
  renamePlaylist,
  setPlaylistDescription,
} from "../api/playlists";

// A PlaylistMirrorWarning means the library change landed and only the PDS
// record didn't, so these invalidate on failure too: the list has moved either
// way, and the caller decides whether to say anything about the mirror.
const invalidate = (
  queryClient: ReturnType<typeof useQueryClient>,
  playlistId?: string,
) => {
  queryClient.invalidateQueries({ queryKey: ["navidrome", "playlists"] });
  if (playlistId) {
    queryClient.invalidateQueries({
      queryKey: ["navidrome", "playlist", playlistId],
    });
  }
};

export const useCreatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      songIds,
    }: {
      name: string;
      description?: string;
      songIds?: string[];
    }) => createPlaylist(name).then((id) => ({ id, songIds })),
    onSuccess: async ({ id, songIds }) => {
      // createPlaylist takes a name and nothing else, so tracks are appended
      // one at a time — in order, since navidrome appends in call order.
      if (id && songIds?.length) {
        for (const songId of songIds) {
          await addTrackToPlaylist(id, songId);
        }
      }
    },
    onSettled: () => invalidate(queryClient),
  });
};

export const useRenamePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playlistId,
      name,
      description,
    }: {
      playlistId: string;
      name?: string;
      description?: string;
    }) => {
      if (name) await renamePlaylist(playlistId, name);
      if (description !== undefined) {
        await setPlaylistDescription(playlistId, description);
      }
    },
    onSettled: (_data, _error, { playlistId }) =>
      invalidate(queryClient, playlistId),
  });
};

export const useDeletePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playlistId: string) => deletePlaylist(playlistId),
    onSettled: () => invalidate(queryClient),
  });
};

export const useAddTrackToPlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playlistId,
      songId,
    }: {
      playlistId: string;
      songId: string;
    }) => addTrackToPlaylist(playlistId, songId),
    onSettled: (_data, _error, { playlistId }) =>
      invalidate(queryClient, playlistId),
  });
};

export const useRemoveTrackFromPlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playlistId,
      index,
    }: {
      playlistId: string;
      index: number;
    }) => removeTrackFromPlaylist(playlistId, index),
    onSettled: (_data, _error, { playlistId }) =>
      invalidate(queryClient, playlistId),
  });
};

export { PlaylistMirrorWarning };
