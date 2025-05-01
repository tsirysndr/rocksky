import axios from "axios";
import { API_URL } from "../consts";

function useLibrary() {
  const getSongByUri = async (uri: string) => {
    const response = await axios.get(`${API_URL}/users/${uri}`);
    return {
      id: response.data?.id,
      title: response.data?.title,
      artist: response.data?.artist,
      albumArtist: response.data?.album_artist,
      album: response.data?.album,
      cover: response.data?.album_art,
      tags: [],
      artistUri: response.data?.artist_uri,
      albumUri: response.data?.album_uri,
      listeners: response.data?.listeners || 1,
      scrobbles: response.data?.scrobbles || 1,
      lyrics: response.data?.lyrics,
      spotifyLink: response.data?.spotify_link,
      composer: response.data?.composer,
      uri: response.data?.uri,
    };
  };

  const getArtistTracks = async (
    uri: string,
    limit = 10
  ): Promise<
    {
      id: string;
      title: string;
      artist: string;
      album_artist: string;
      album_art: string;
      uri: string;
      play_count: number;
      album_uri?: string;
      artist_uri?: string;
    }[]
  > => {
    const response = await axios.get(
      `${API_URL}/users/${uri}/tracks?size=${limit}`
    );
    return response.data;
  };

  const getArtistAlbums = async (
    uri: string,
    limit = 10
  ): Promise<
    {
      id: string;
      title: string;
      artist: string;
      album_art: string;
      artist_uri: string;
      uri: string;
    }[]
  > => {
    const response = await axios.get(
      `${API_URL}/users/${uri}/albums?size=${limit}`
    );
    return response.data;
  };

  const getArtists = async (did: string, offset = 0, limit = 30) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/artists?size=${limit}&offset=${offset}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.data.map((x: any) => ({ ...x, scrobbles: x.play_count }));
  };

  const getAlbums = async (did: string, offset = 0, limit = 12) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/albums?size=${limit}&offset=${offset}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.data.map((x: any) => ({
      ...x,
      scrobbles: x.play_count,
    }));
  };

  const getTracks = async (did: string, offset = 0, limit = 20) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/tracks?size=${limit}&offset=${offset}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.data.map((x: any) => ({ ...x, scrobbles: x.play_count }));
  };

  const getLovedTracks = async (did: string, offset = 0, limit = 20) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/likes?size=${limit}&offset=${offset}`
    );
    return response.data;
  };

  const getAlbum = async (did: string, rkey: string) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/app.rocksky.album/${rkey}`
    );
    return response.data;
  };

  const getArtist = async (did: string, rkey: string) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/app.rocksky.artist/${rkey}`
    );
    return response.data;
  };

  return {
    getSongByUri,
    getArtists,
    getAlbums,
    getTracks,
    getLovedTracks,
    getAlbum,
    getArtist,
    getArtistTracks,
    getArtistAlbums,
  };
}

export default useLibrary;
