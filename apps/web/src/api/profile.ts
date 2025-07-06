import axios from "axios";
import { API_URL } from "../consts";
import { Scrobble } from "../types/scrobble";

export const getProfileByDid = async (did: string) => {
  const response = await axios.get(`${API_URL}/users/${did}`);
  return response.data;
};

export const getProfileStatsByDid = async (did: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.stats.getStats`,
    { params: { did } }
  );
  return response.data;
};

export const getRecentTracksByDid = async (
  did: string,
  offset = 0,
  size = 10
): Promise<Scrobble[]> => {
  const response = await axios.get<Scrobble[]>(
    `${API_URL}/users/${did}/scrobbles`,
    { params: { size, offset } }
  );
  return response.data;
};
