import axios from "axios";
import { API_URL } from "../consts";

const authHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});
export const joinBeta = async (email: string, platform: string) => {
  switch (platform) {
    case "spotify":
      return await axios.post(
        `${API_URL}/spotify/join`,
        { email },
        { headers: authHeaders() },
      );
    case "google":
      return await axios.post(
        `${API_URL}/googledrive/join`,
        { email },
        { headers: authHeaders() },
      );
    case "dropbox":
      return await axios.post(
        `${API_URL}/dropbox/join`,
        { email },
        { headers: authHeaders() },
      );
    default:
      return;
  }
};
