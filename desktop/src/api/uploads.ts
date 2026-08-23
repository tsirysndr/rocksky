import axios from "axios";
import { API_URL } from "../consts";

const headers = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export interface UploadResult {
  uploadId: string;
  trackId: string;
  track: {
    title: string;
    artist: string;
    album: string;
    duration: number;
    genre: string | null;
  };
}

export interface UploadError {
  error: string;
  message: string;
  missingFields?: string[];
}

export const uploadTrack = async (
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post<UploadResult>(
    `${API_URL}/uploads/track`,
    formData,
    {
      headers: {
        ...headers(),
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

export const deleteUpload = async (uploadId: string): Promise<void> => {
  await axios.delete(`${API_URL}/uploads/${uploadId}`, {
    headers: headers(),
  });
};

export const deleteUploadByTrackId = async (trackId: string): Promise<void> => {
  await axios.delete(`${API_URL}/uploads/by-track/${trackId}`, {
    headers: headers(),
  });
};

export const deleteAlbum = async (params: {
  albumUri?: string;
  albumArtist?: string;
  albumName?: string;
}): Promise<{ deleted: number }> => {
  const response = await axios.delete<{ status: string; deleted: number }>(
    `${API_URL}/uploads/album`,
    {
      headers: headers(),
      params: {
        ...(params.albumUri ? { albumUri: params.albumUri } : {}),
        ...(params.albumArtist ? { albumArtist: params.albumArtist } : {}),
        ...(params.albumName ? { albumName: params.albumName } : {}),
      },
    },
  );
  return { deleted: response.data.deleted };
};

export const deleteAlbumById = async (albumId: string): Promise<{ deleted: number }> => {
  const response = await axios.delete<{ status: string; deleted: number }>(
    `${API_URL}/uploads/by-album/${albumId}`,
    { headers: headers() },
  );
  return { deleted: response.data.deleted };
};

const STREAM_TOKEN_KEY = "stream_token";
const STREAM_TOKEN_EXP_KEY = "stream_token_exp";
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const ensureStreamToken = async (): Promise<void> => {
  const exp = parseInt(localStorage.getItem(STREAM_TOKEN_EXP_KEY) ?? "0", 10);
  if (Date.now() < exp - 5 * 60 * 1000) return;

  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }

  try {
    const response = await axios.get<{ token: string; expiresIn: number }>(
      `${API_URL}/uploads/stream-token`,
      { headers: headers() },
    );
    const newExp = Date.now() + response.data.expiresIn * 1000;
    localStorage.setItem(STREAM_TOKEN_KEY, response.data.token);
    localStorage.setItem(STREAM_TOKEN_EXP_KEY, String(newExp));
    const refreshIn = Math.max(0, newExp - Date.now() - 5 * 60 * 1000);
    _refreshTimer = setTimeout(ensureStreamToken, refreshIn);
  } catch {
    _refreshTimer = setTimeout(ensureStreamToken, 60 * 1000);
  }
};

export const getStreamUrl = (uploadId: string): string => {
  const streamToken = localStorage.getItem(STREAM_TOKEN_KEY);
  const exp = parseInt(localStorage.getItem(STREAM_TOKEN_EXP_KEY) ?? "0", 10);
  const token = (streamToken && Date.now() < exp) ? streamToken : localStorage.getItem("token");
  return `${API_URL}/uploads/${uploadId}/stream?token=${token}`;
};

export interface PersistedQueueTrack {
  uploadId: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string | null;
  duration: number;
  sha256: string;
  songUri: string;
  trackNumber?: number | null;
  copyrightMessage?: string | null;
  genre?: string | null;
  releaseDate?: string | null;
  year?: number | null;
}

export const getQueueState = async (): Promise<{
  queue: PersistedQueueTrack[];
  currentIndex: number;
}> => {
  const response = await axios.get<{ queue: PersistedQueueTrack[]; currentIndex: number }>(
    `${API_URL}/uploads/queue`,
    { headers: headers() },
  );
  return response.data;
};

export const saveQueueState = async (
  uploadIds: string[],
  currentIndex: number,
): Promise<void> => {
  await axios.put(
    `${API_URL}/uploads/queue`,
    { uploadIds, currentIndex },
    { headers: headers() },
  );
};
