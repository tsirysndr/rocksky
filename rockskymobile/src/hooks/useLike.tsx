import axios from "axios";
import { API_URL } from "../consts";

const useLike = () => {
  const like = async (uri: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/likes`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };
  const unlike = async (uri: string) => {
    const response = await axios.delete(
      `${API_URL}/users/${uri.replace("at://", "")}/likes`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };
  const getLikes = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/users/${uri.replace("at://", "")}/likes`
    );
    return response.data;
  };

  return { like, unlike, getLikes };
};

export default useLike;
