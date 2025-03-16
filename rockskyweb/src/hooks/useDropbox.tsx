import axios from "axios";
import { API_URL } from "../consts";

function useDropbox() {
  const getFiles = async (id?: string) => {
    const response = await axios.get<{
      cursor: string;
      entries: {
        ".tag": string;
        id: string;
        name: string;
        path_display: string;
      }[];
      has_more: boolean;
    }>(`${API_URL}/dropbox/files`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: {
        path: id,
      },
    });
    return response.data;
  };

  return {
    getFiles,
  };
}

export default useDropbox;
