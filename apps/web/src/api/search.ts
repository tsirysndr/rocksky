import axios from "axios";
import { API_URL } from "../consts";

export const search = async (query: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.feed.search?query=${query}&size=100`
  );
  return response.data;
};
