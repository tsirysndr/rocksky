import axios from "axios";
import { ROCKSKY_API_URL } from "client";
import FormData from "form-data";
import fs from "fs";
import path from "path";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
};

export const AUDIO_EXTS = Object.keys(MIME);

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

/**
 * Expand the given paths into a flat list of audio files, walking directories
 * recursively.
 */
export function collectAudioFiles(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    } else if (AUDIO_EXTS.includes(path.extname(p).toLowerCase())) {
      out.push(p);
    }
  };
  paths.forEach(walk);
  return out;
}

/**
 * Upload one audio file to Rocksky, reporting 0–100 progress. Resolves with the
 * created upload; rejects with an AxiosError whose `response.data` holds the
 * server's `{ error, message }` on validation failures (400/409/422).
 */
export async function uploadTrack(
  token: string,
  filePath: string,
  onProgress: (percent: number) => void,
  /** BYO storage provider to upload into; omitted = Rocksky managed storage. */
  storageProviderId?: string,
): Promise<UploadResult> {
  const size = fs.statSync(filePath).size;
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    knownLength: size,
  });
  if (storageProviderId) {
    form.append("storage_provider_id", storageProviderId);
  }

  const response = await axios.post<UploadResult>(
    `${ROCKSKY_API_URL}/uploads/track`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (e) => {
        const total = e.total || size;
        if (total) onProgress(Math.min(100, Math.round((e.loaded * 100) / total)));
      },
    },
  );

  return response.data;
}

export interface StorageProvider {
  id: string;
  label: string;
  endpoint: string;
  bucket: string;
}

/**
 * Resolve a `--storage` ref to a provider id. Matches the provider's label,
 * bucket or id, case-insensitively; a miss or an ambiguous match throws with
 * the available providers listed, which is also how a user discovers them.
 */
export async function resolveStorageProvider(
  token: string,
  ref: string,
): Promise<StorageProvider> {
  const { data: providers } = await axios.get<StorageProvider[]>(
    `${ROCKSKY_API_URL}/storage/providers`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (providers.length === 0) {
    throw new Error(
      "You have no storage connected. Add one under Storage in the app, then retry.",
    );
  }

  const q = ref.trim().toLowerCase();
  const matches = providers.filter(
    (p) =>
      p.id === ref ||
      p.label.toLowerCase() === q ||
      p.bucket.toLowerCase() === q,
  );

  const list = providers
    .map((p) => `  ${p.label} · ${p.bucket} (${p.id})`)
    .join("\n");
  if (matches.length === 0) {
    throw new Error(`No storage matches "${ref}". Connected storage:\n${list}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `"${ref}" matches more than one storage — use the id instead:\n${list}`,
    );
  }
  return matches[0];
}
