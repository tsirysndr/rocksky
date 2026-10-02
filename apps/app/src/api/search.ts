import axios from "axios";
import { API_URL } from "../consts";

export type SearchHit = {
  id: string;
  uri?: string;
  title?: string;
  name?: string;
  displayName?: string;
  handle?: string;
  did?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  cover?: string;
  picture?: string;
  avatar?: string;
  year?: number;
  _federation?: { indexUid: string };
};

export const search = async (query: string): Promise<{ hits: SearchHit[] }> => {
  const response = await axios.get<{ hits: SearchHit[] }>(
    `${API_URL}/xrpc/app.rocksky.feed.search`,
    {
      params: { query, size: 100 },
    },
  );
  return response.data;
};
