import axios from "axios";
import { API_URL } from "../consts";

const headers = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export interface UploadedTrack {
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
    artistUri: string | null;
    albumUri: string | null;
  };
}

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

export const getUploads = async (offset = 0, size = 50) => {
  const response = await axios.get<UploadedTrack[]>(`${API_URL}/uploads`, {
    headers: headers(),
    params: { offset, size },
  });
  return response.data;
};

export const getStreamUrl = async (
  uploadId: string,
): Promise<{ url: string; expiresIn: number }> => {
  const response = await axios.get<{ url: string; expiresIn: number }>(
    `${API_URL}/uploads/${uploadId}/stream`,
    { headers: headers() },
  );
  return response.data;
};

export const deleteUpload = async (uploadId: string): Promise<void> => {
  await axios.delete(`${API_URL}/uploads/${uploadId}`, {
    headers: headers(),
  });
};

export interface PersistedQueueTrack {
  uploadId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  duration: number;
  sha256: string;
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
