import axios from "axios";
import { client } from ".";
import { API_URL } from "../consts";

export const getFiles = async (id?: string) => {
  const response = await client.get<{
    parentDirectory: {
      id: string;
      name: string;
      path: string;
      fileId: string;
    };
    directories: {
      id: string;
      name: string;
      fileId: string;
      path: string;
      parentId?: string;
    }[];
    files: {
      id: string;
      name: string;
      fileId: string;
      directoryId: string;
      trackId: string;
    }[];
  }>("/xrpc/app.rocksky.dropbox.getFiles", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    params: {
      at: id,
    },
  });
  return response.data;
};

export const getFile = async (id: string) => {
  const response = await client.get<{
    ".tag": string;
    id: string;
    name: string;
    path_display: string;
  }>("/xrpc/app.rocksky.dropbox.getFiles", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    params: {
      path: id,
    },
  });
  return response.data;
};

export const getTemporaryLink = async (id: string) => {
  const response = await axios.get<{
    link: string;
  }>(`${API_URL}/dropbox/temporary-link`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    params: {
      path: id,
    },
  });
  return response.data;
};
