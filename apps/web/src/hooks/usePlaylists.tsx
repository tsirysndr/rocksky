import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  addSongsToPlaylist,
  createPlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylist,
  removeTrackFromPlaylist,
  updatePlaylist,
} from "../api/playlists";
import { API_URL } from "../consts";

// did + filter must be in the key; without them every profile shared one entry.
export const usePlaylistsQuery = (did: string, filter?: string) =>
  useQuery({
    queryKey: ["playlists", did, filter ?? null],
    queryFn: () => getPlaylists(did, filter),
  });

export const usePlaylistQuery = (did: string, rkey: string) =>
  useQuery({
    queryKey: ["playlist", did, rkey],
    queryFn: () => getPlaylist(did, rkey),
  });

export const useCreatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

export const useAddSongsToPlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addSongsToPlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist"] });
    },
  });
};

export const useUpdatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist"] });
    },
  });
};

export const useRemovePlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removePlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

export const useRemoveTrackFromPlaylistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeTrackFromPlaylist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist"] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

const usePlaylists = () => {
  const getPlaylists = async (
    did: string,
  ): Promise<
    {
      id: string;
      name: string;
      picture: string;
      description?: string;
      uri?: string;
      spotifyLink?: string;
      tidalLink?: string;
      appleMusicLink?: string;
      trackCount: number;
    }[]
  > => {
    const response = await axios.get(`${API_URL}/users/${did}/playlists`);
    return response.data;
  };

  const getPlaylist = async (
    did: string,
    rkey: string,
  ): Promise<{
    id: string;
    name: string;
    picture: string;
    description?: string;
    uri?: string;
    spotifyLink?: string;
    tidalLink?: string;
    appleMusicLink?: string;
    curatedBy: {
      id: string;
      displayName: string;
      did: string;
      avatar: string;
      handle: string;
    };
    trackCount: number;
    tracks: {
      id: string;
      trackNumber: number;
      album: string;
      albumArt: string;
      albumArtist: string;
      title: string;
      artist: string;
      createdAt: string;
      uri: string;
      albumUri: string;
      artistUri: string;
      duration: number;
      discNumber: number;
      liked?: boolean;
    }[];
  }> => {
    // The token is optional — it only decides whether the tracks come back
    // with `liked` set. Without it every heart renders empty.
    const token = localStorage.getItem("token");
    const response = await axios.get(
      `${API_URL}/users/${did}/app.rocksky.playlist/${rkey}`,
      token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    );
    return response.data;
  };

  return { getPlaylists, getPlaylist };
};

export default usePlaylists;
