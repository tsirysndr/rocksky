import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

const authHeaders = () => ({
  authorization: `Bearer ${storage.getToken()}`,
});

export type UploadedTrack = {
  upload: {
    id: string;
    userId: string;
    trackId: string;
    r2Key: string;
    mimeType: string;
    fileSize: number;
    originalFilename: string;
    uploadedAt: string;
  };
  track: {
    id: string;
    title: string;
    artist: string;
    albumArtist: string;
    album: string;
    albumArt: string | null;
    duration: number;
    genre: string | null;
    trackNumber: number | null;
    sha256: string;
    uri: string | null;
    artistUri: string | null;
    albumUri: string | null;
    copyrightMessage: string | null;
  };
  albumReleaseDate: string | null;
  albumYear: number | null;
};

export type UploadAlbum = {
  albumArtist: string;
  album: string;
  albumArt: string | null;
  albumUri: string | null;
  artistUri: string | null;
  trackCount: number;
};

export type UploadArtist = {
  name: string;
  artistUri: string | null;
  trackCount: number;
  albumCount: number;
};

export type UploadResult = {
  uploadId: string;
  trackId: string;
  track: {
    title: string;
    artist: string;
    album: string;
    duration: number;
    genre: string | null;
  };
};

export type UploadFilters = {
  q?: string;
  albumUri?: string;
  albumArtist?: string;
  albumName?: string;
};

export const getUploads = async (
  offset = 0,
  size = 50,
  filters: UploadFilters = {},
): Promise<UploadedTrack[]> => {
  const response = await axios.get<UploadedTrack[]>(`${API_URL}/uploads`, {
    headers: authHeaders(),
    params: {
      offset,
      size,
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.albumUri ? { albumUri: filters.albumUri } : {}),
      ...(filters.albumArtist ? { albumArtist: filters.albumArtist } : {}),
      ...(filters.albumName ? { albumName: filters.albumName } : {}),
    },
  });
  return response.data;
};

export const getUploadAlbums = async (
  offset = 0,
  size = 50,
  q?: string,
): Promise<UploadAlbum[]> => {
  const response = await axios.get<UploadAlbum[]>(`${API_URL}/uploads/albums`, {
    headers: authHeaders(),
    params: { offset, size, ...(q ? { q } : {}) },
  });
  return response.data;
};

export const getUploadArtists = async (
  offset = 0,
  size = 50,
  q?: string,
): Promise<UploadArtist[]> => {
  const response = await axios.get<UploadArtist[]>(
    `${API_URL}/uploads/artists`,
    {
      headers: authHeaders(),
      params: { offset, size, ...(q ? { q } : {}) },
    },
  );
  return response.data;
};

export const getAlbumTracks = async (
  filters: UploadFilters,
): Promise<UploadedTrack[]> => {
  const all: UploadedTrack[] = [];
  let offset = 0;
  const size = 200;
  while (true) {
    const page = await getUploads(offset, size, filters);
    all.push(...page);
    if (page.length < size) break;
    offset += size;
  }
  return all;
};

export type PickedAudioFile = {
  uri: string;
  name: string;
  mimeType: string;
};

export const uploadTrack = async (
  file: PickedAudioFile,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> => {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const response = await axios.post<UploadResult>(
    `${API_URL}/uploads/track`,
    formData,
    {
      headers: {
        ...authHeaders(),
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    },
  );
  return response.data;
};

// Short-lived token carried by stream URLs (the engine fetches them with no
// auth header).
let streamToken: { token: string; expiresAt: number } | null = null;

export const ensureStreamToken = async (): Promise<void> => {
  if (streamToken && Date.now() < streamToken.expiresAt - 5 * 60 * 1000) {
    return;
  }
  try {
    const response = await axios.get<{ token: string; expiresIn: number }>(
      `${API_URL}/uploads/stream-token`,
      { headers: authHeaders() },
    );
    streamToken = {
      token: response.data.token,
      expiresAt: Date.now() + response.data.expiresIn * 1000,
    };
  } catch {}
};

export const getStreamUrl = (uploadId: string): string => {
  const token =
    streamToken && Date.now() < streamToken.expiresAt
      ? streamToken.token
      : storage.getToken();
  return `${API_URL}/uploads/${uploadId}/stream?token=${token}`;
};

export type ScrobbleInput = {
  title: string;
  artist: string;
  albumArtist: string;
  album?: string;
  albumArt?: string;
  duration?: number;
  timestamp?: number;
};

export const submitScrobble = async (input: ScrobbleInput): Promise<void> => {
  await axios.post(
    `${API_URL}/xrpc/app.rocksky.scrobble.createScrobble`,
    input,
    { headers: authHeaders() },
  );
};
