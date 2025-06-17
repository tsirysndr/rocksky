import axios from "axios";
import { API_URL } from "../consts";

export const search = async (query: string) => {
  const response = await axios.get(`${API_URL}/search?q=${query}&size=100`);
  return response.data;
};
