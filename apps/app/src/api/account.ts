import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

const options = () => ({
  headers: { Authorization: `Bearer ${storage.getToken()}` },
});
export type ApiKey = {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  sharedSecret: string;
  enabled: boolean;
};
export type AccessToken = {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt?: string | null;
  token?: string;
};
export type StorageProvider = {
  id: string;
  label: string;
  endpoint: string;
  bucket: string;
  region: string;
  verified_at?: string | null;
};
export type MirrorSource = {
  provider: "lastfm" | "listenbrainz" | "tealfm";
  enabled: boolean;
  externalUsername?: string;
  hasCredentials: boolean;
  lastPolledAt?: string;
};
export type MirrorInput = Pick<MirrorSource, "provider"> & {
  enabled?: boolean;
  externalUsername?: string;
  apiKey?: string;
};
export type StorageInput = {
  label: string;
  endpoint: string;
  bucket: string;
  region?: string;
  access_key: string;
  secret_key: string;
  public_url?: string;
};
export const getApiKeys = async (offset = 0) =>
  (
    await axios.get<ApiKey[]>(`${API_URL}/apikeys`, {
      ...options(),
      params: { offset, size: 50 },
    })
  ).data;
export const createApiKey = async (name: string, description: string) =>
  (
    await axios.post<ApiKey>(
      `${API_URL}/apikeys`,
      { name, description },
      options(),
    )
  ).data;
export const updateApiKey = async (id: string, enabled: boolean) =>
  (
    await axios.put(
      `${API_URL}/apikeys/${encodeURIComponent(id)}`,
      { enabled },
      options(),
    )
  ).data;
export const deleteApiKey = async (id: string) => {
  await axios.delete(`${API_URL}/apikeys/${encodeURIComponent(id)}`, options());
};
export const getAccessTokens = async (offset = 0) =>
  (
    await axios.get<AccessToken[]>(`${API_URL}/access-tokens`, {
      ...options(),
      params: { offset, size: 50 },
    })
  ).data;
export const createAccessToken = async (name: string) =>
  (
    await axios.post<AccessToken>(
      `${API_URL}/access-tokens`,
      { name },
      options(),
    )
  ).data;
export const deleteAccessToken = async (id: string) => {
  await axios.delete(
    `${API_URL}/access-tokens/${encodeURIComponent(id)}`,
    options(),
  );
};
export const getStorageProviders = async () =>
  (
    await axios.get<StorageProvider[]>(
      `${API_URL}/storage/providers`,
      options(),
    )
  ).data;
export const createStorageProvider = async (input: StorageInput) =>
  (
    await axios.post<StorageProvider>(
      `${API_URL}/storage/providers`,
      input,
      options(),
    )
  ).data;
export const deleteStorageProvider = async (id: string) => {
  await axios.delete(
    `${API_URL}/storage/providers/${encodeURIComponent(id)}`,
    options(),
  );
};
export const getMirrorSources = async () =>
  (
    await axios.get<{ sources?: MirrorSource[] }>(
      `${API_URL}/xrpc/app.rocksky.mirror.getMirrorSources`,
      options(),
    )
  ).data.sources ?? [];
export const putMirrorSource = async (input: MirrorInput) =>
  (
    await axios.post<MirrorSource>(
      `${API_URL}/xrpc/app.rocksky.mirror.putMirrorSource`,
      input,
      options(),
    )
  ).data;
export type WrappedPeriod = "year" | "3months" | "month" | "2weeks" | "week";
export type Wrapped = {
  totalScrobbles: number;
  totalListeningTimeMinutes: number;
  newArtistsCount: number;
  longestStreak: number;
  topArtists: { id: string; name: string; playCount: number }[];
  topTracks: { id: string; title: string; artist: string; playCount: number }[];
  topAlbums: { id: string; title: string; artist: string; playCount: number }[];
  topGenres: { genre: string; count: number }[];
};
export const getWrapped = async (
  did: string,
  year: number,
  period: WrappedPeriod,
) =>
  (
    await axios.get<Wrapped>(`${API_URL}/xrpc/app.rocksky.stats.getWrapped`, {
      ...options(),
      params: { did, year, period },
    })
  ).data;
