import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

export const like = async (uri: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
    {},
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${storage.getToken()}`,
      },
    },
  );
  return response.data;
};

export const unlike = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
    { headers: { Authorization: `Bearer ${storage.getToken()}` } },
  );
  return response.data;
};

export const getLikes = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
  );
  return response.data;
};

export type SongLikeState = {
  /** The song's AT-URI, which the like/unlike calls address it by. */
  uri: string | null;
  liked: boolean;
};

/**
 * Whether the caller already loves a song, looked up by record URI or
 * MusicBrainz id.
 *
 * getSong fills `liked` in only for an authenticated caller, and answers `{}`
 * rather than failing when the song is unknown — hence the loose read.
 */
export const getSongLikeState = async (
  params: { uri: string } | { mbid: string },
): Promise<SongLikeState | null> => {
  try {
    const response = await axios.get<{ uri?: string | null; liked?: boolean }>(
      `${API_URL}/xrpc/app.rocksky.song.getSong`,
      {
        params,
        headers: { Authorization: `Bearer ${storage.getToken()}` },
      },
    );
    const song = response.data;
    if (!song || typeof song !== "object" || typeof song.liked !== "boolean")
      return null;
    return { uri: song.uri ?? null, liked: song.liked === true };
  } catch {
    return null;
  }
};
