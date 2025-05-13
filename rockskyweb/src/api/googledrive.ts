import axios from "axios";
import { API_URL } from "../consts";

export const getFiles = async (parent_id?: string) => {
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

export const getFile = async (id: string) => {
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
