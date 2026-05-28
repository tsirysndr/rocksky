import { client } from ".";

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

const getHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getStorageProviders = async (): Promise<StorageProvider[]> => {
  const res = await client.get<StorageProvider[]>("/storage/providers", {
    headers: getHeaders(),
  });
  return res.data;
};

export const createStorageProvider = async (
  input: CreateStorageProviderInput,
): Promise<StorageProvider> => {
  const res = await client.post<StorageProvider>("/storage/providers", input, {
    headers: getHeaders(),
  });
  return res.data;
};

export const deleteStorageProvider = async (id: string): Promise<void> => {
  await client.delete(`/storage/providers/${id}`, { headers: getHeaders() });
};
