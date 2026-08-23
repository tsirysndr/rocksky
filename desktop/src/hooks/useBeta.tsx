import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { joinBeta } from "../api/beta";
import { API_URL } from "../consts";

export const useJoinBetaMutation = () =>
  useMutation({
    mutationFn: ({ email, platform }: { email: string; platform: string }) =>
      joinBeta(email, platform),
  });

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
          { headers },
        );
      case "google":
        return await axios.post(
          `${API_URL}/googledrive/join`,
          { email },
          { headers },
        );
      case "dropbox":
        return await axios.post(
          `${API_URL}/dropbox/join`,
          { email },
          { headers },
        );
      default:
        return;
    }
  };

  return { joinBeta };
}

export default useBeta;
