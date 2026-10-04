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

export class PlaylistCreationError extends Error {
  constructor(
    public playlistId: string,
    public remainingSongIds: string[],
    cause: unknown,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : "Could not add tracks to the playlist",
    );
  }
}

export const useCreatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      songIds = [],
      playlistId,
    }: {
      name: string;
      songIds?: string[];
      playlistId?: string;
    }) => {
      let id = playlistId;
      const warnings: string[] = [];
      if (!id) {
        try {
          id = (await createPlaylist(name)) ?? undefined;
        } catch (error) {
          if (!(error instanceof PlaylistMirrorWarning) || !error.playlistId)
            throw error;
          id = error.playlistId;
          warnings.push(error.message);
        }
      }
      if (!id) throw new Error("The server did not return a playlist.");
      const unique = [...new Set(songIds)];
      for (let index = 0; index < unique.length; index++) {
        try {
          await addTrackToPlaylist(id, unique[index]);
        } catch (error) {
          if (error instanceof PlaylistMirrorWarning)
            warnings.push(error.message);
          else throw new PlaylistCreationError(id, unique.slice(index), error);
        }
      }
      return { id, warnings };
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
