import axios from "axios";
import { API_URL } from "../consts";

export const getPlaylists = async (
  did: string
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

export const getPlaylist = async (
  did: string,
  rkey: string
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
  }[];
}> => {
  const response = await axios.get(
    `${API_URL}/users/${did}/app.rocksky.playlist/${rkey}`
  );
  return response.data;
};
