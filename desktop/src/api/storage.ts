import axios from "axios";
import { API_URL } from "../consts";

const headers = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export interface StorageProvider {
  id: string;
  label: string;
  endpoint: string;
  region: string;
  bucket: string;
  public_url: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface CreateStorageProviderInput {
  label: string;
  endpoint: string;
  region?: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  public_url?: string;
}

export const getStorageProviders = async (): Promise<StorageProvider[]> => {
  const res = await axios.get<StorageProvider[]>(`${API_URL}/storage/providers`, {
    headers: headers(),
  });
  return res.data;
};

export const createStorageProvider = async (
  input: CreateStorageProviderInput,
): Promise<StorageProvider> => {
  const res = await axios.post<StorageProvider>(
    `${API_URL}/storage/providers`,
    input,
    { headers: headers() },
  );
  return res.data;
};

export const deleteStorageProvider = async (id: string): Promise<void> => {
  await axios.delete(`${API_URL}/storage/providers/${id}`, {
    headers: headers(),
  });
};
