import axios from "axios";
import { API_URL } from "../consts";

function useBeta() {
  const joinBeta = async (email: string) => {
    await axios.post(
      `${API_URL}/spotify/join`,
      {
        email,
      },
      {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
  };

  return { joinBeta };
}

export default useBeta;
