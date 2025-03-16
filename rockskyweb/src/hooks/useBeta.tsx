import axios from "axios";
import { API_URL } from "../consts";

function useBeta() {
  const headers = {
    authorization: `Bearer ${localStorage.getItem("token")}`,
  };
  const joinBeta = async (email: string, platform: string) => {
    switch (platform) {
      case "spotify":
        return await axios.post(
          `${API_URL}/spotify/join`,
          { email },
          { headers }
        );
      case "google":
        return await axios.post(
          `${API_URL}/googledrive/join`,
          { email },
          { headers }
        );
      case "dropbox":
        return await axios.post(
          `${API_URL}/dropbox/join`,
          { email },
          { headers }
        );
      default:
        return;
    }
  };

  return { joinBeta };
}

export default useBeta;
