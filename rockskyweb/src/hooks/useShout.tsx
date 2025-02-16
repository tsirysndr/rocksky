import axios from "axios";
import { useCallback } from "react";
import { API_URL } from "../consts";

function useShout() {
  const shout = async (uri: string, message: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
      { message },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const getShouts = useCallback(async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  }, []);

  const reply = async (uri: string, message: string) => {
    const response = await axios.post(
      `${API_URL}/users/${uri.replace("at://", "")}/replies`,
      { message },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const getReplies = useCallback(async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/users/${uri.replace("at://", "")}/replies`
    );
    return response.data;
  }, []);

  return { shout, getShouts, reply, getReplies };
}

export default useShout;
