import axios from "axios";
import { ROCKSKY_API_URL } from "../client.js";
import FormData from "form-data";
import fs from "fs";
import path from "path";
const MIME = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff"
};
const AUDIO_EXTS = Object.keys(MIME);
function collectAudioFiles(paths) {
  const out = [];
  const walk = (p) => {
    let stat;
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
async function uploadTrack(token, filePath, onProgress, storageProviderId) {
  const size = fs.statSync(filePath).size;
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    knownLength: size
  });
  if (storageProviderId) {
    form.append("storage_provider_id", storageProviderId);
  }
  const response = await axios.post(
    `${ROCKSKY_API_URL}/uploads/track`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (e) => {
        const total = e.total || size;
        if (total) onProgress(Math.min(100, Math.round(e.loaded * 100 / total)));
      }
    }
  );
  return response.data;
}
async function resolveStorageProvider(token, ref) {
  const { data: providers } = await axios.get(
    `${ROCKSKY_API_URL}/storage/providers`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (providers.length === 0) {
    throw new Error(
      "You have no storage connected. Add one under Storage in the app, then retry."
    );
  }
  const q = ref.trim().toLowerCase();
  const matches = providers.filter(
    (p) => p.id === ref || p.label.toLowerCase() === q || p.bucket.toLowerCase() === q
  );
  const list = providers.map((p) => `  ${p.label} \xB7 ${p.bucket} (${p.id})`).join("\n");
  if (matches.length === 0) {
    throw new Error(`No storage matches "${ref}". Connected storage:
${list}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `"${ref}" matches more than one storage \u2014 use the id instead:
${list}`
    );
  }
  return matches[0];
}
export {
  AUDIO_EXTS,
  collectAudioFiles,
  resolveStorageProvider,
  uploadTrack
};
