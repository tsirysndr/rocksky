import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { getFile, getFiles, getTemporaryLink } from "../api/dropbox";

export const useFilesQuery = (id?: string) =>
  useQuery({
    queryKey: ["dropbox", "files", id],
    queryFn: () => getFiles(id),
  });

export const useFileQuery = (id: string) =>
  useQuery({
    queryKey: ["dropbox", "file", id],
    queryFn: () => getFile(id),
  });

export const useTemporaryLinkQuery = (id: string) =>
  useQuery({
    queryKey: ["dropbox", "temporary-link", id],
    queryFn: () => getTemporaryLink(id),
  });

function useDropbox() {
  const getFiles = async (id?: string) => {
    const response = await client.get<{
      cursor: string;
      entries: {
        ".tag": string;
        id: string;
        name: string;
        path_display: string;
      }[];
      has_more: boolean;
    }>(`/dropbox/files`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: {
        path: id,
      },
    });
    return response.data;
  };

  const getFile = async (id: string) => {
    const response = await client.get<{
      ".tag": string;
      id: string;
      name: string;
      path_display: string;
    }>(`/dropbox/file`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: {
        path: id,
      },
    });
    return response.data;
  };

  const getTemporaryLink = async (id: string) => {
    const response = await client.get<{
      link: string;
    }>(`/dropbox/temporary-link`, {
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
    getFile,
    getTemporaryLink,
  };
}

export default useDropbox;
