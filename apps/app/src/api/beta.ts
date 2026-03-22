import axios from "axios";
import { API_URL } from "../consts";

const getHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const joinBeta = async (email: string, platform: string) => {
  switch (platform) {
    case "spotify":
      return await axios.post(
        `${API_URL}/spotify/join`,
        { email },
        { headers: getHeaders() },
      );
    case "google":
      return await axios.post(
        `${API_URL}/googledrive/join`,
        { email },
        { headers: getHeaders() },
      );
    case "dropbox":
      return await axios.post(
        `${API_URL}/dropbox/join`,
        { email },
        { headers: getHeaders() },
      );
    default:
      return;
  }
};
