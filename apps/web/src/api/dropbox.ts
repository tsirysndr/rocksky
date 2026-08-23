import axios from "axios";
import { API_URL } from "../consts";
import { rocksky } from "../lib/rocksky";

export const getFiles = async (id?: string) => {
  const response = (await rocksky().get("app.rocksky.dropbox.getFiles", {
    at: id,
  })) as {
    parentDirectory: {
      id: string;
      name: string;
      path: string;
      fileId: string;
    };
    directory: {
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
  };
  return response;
};

export const getFile = async (id: string) => {
  const response = (await rocksky().get("app.rocksky.dropbox.getFiles", {
    path: id,
  })) as {
    ".tag": string;
    id: string;
    name: string;
    path_display: string;
  };
  return response;
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
