import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { getFile, getFiles } from "../api/googledrive";
import { API_URL } from "../consts";

export const useFilesQuery = (id?: string) =>
  useQuery({
    queryKey: ["googledrive", "files", id],
    queryFn: () => getFiles(id),
  });

export const useFileQuery = (id: string) =>
  useQuery({
    queryKey: ["googledrive", "file", id],
    queryFn: () => getFile(id),
  });

function useGoogleDrive() {
  const getFiles = async (parent_id?: string) => {
    const response = await axios.get<{
      files: {
        id: string;
        mimeType: string;
        name: string;
        parents: string[];
      }[];
      authUrl?: string;
      error?: string;
    }>(`${API_URL}/googledrive/files`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: {
        parent_id,
      },
    });
    return response.data;
  };

  const getFile = async (id: string) => {
    const response = await axios.get<{
      id: string;
      mimeType: string;
      name: string;
      parents: string[];
    }>(`${API_URL}/googledrive/files/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    return response.data;
  };

  return {
    getFiles,
    getFile,
  };
}

export default useGoogleDrive;
