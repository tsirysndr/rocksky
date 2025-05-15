import axios from "axios";
import { API_URL } from "../consts";

export const getFeed = () => {
  return [];
};

export const getFeedByUri = async (uri: string) => {
  const response = await axios.get(`${API_URL}/users/${uri}`);

  if (response.status !== 200) {
    return null;
  }

  return {
    id: response.data.track_id?.xata_id,
    title: response.data.track_id?.title,
    artist: response.data.track_id?.artist,
    albumArtist: response.data.track_id?.album_artist,
    album: response.data.track_id?.album,
    cover: response.data.track_id?.album_art,
    tags: [],
    artistUri: response.data.track_id?.artist_uri,
    albumUri: response.data.track_id?.album_uri,
    listeners: response.data.listeners || 1,
    scrobbles: response.data.scrobbles || 1,
    lyrics: response.data.track_id?.lyrics,
    spotifyLink: response.data.track_id?.spotify_link,
    composer: response.data.track_id?.composer,
    uri: response.data.track_id?.uri,
  };
};
