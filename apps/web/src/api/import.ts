import { API_URL } from "../consts";

export type ImportJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type ImportJob = {
  id: string;
  userId: string;
  type: "lastfm" | "spotify";
  status: ImportJobStatus;
  total: number;
  processed: number;
  failed: number;
  errors: string | null;
  currentTrack: string | null;
  createdAt: string;
  updatedAt: string;
};

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  };
}

export async function uploadImportFile(
  file: File,
  type: "lastfm" | "spotify",
): Promise<ImportJob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const res = await fetch(`${API_URL}/import/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }

  return res.json();
}

export async function getImportStatus(): Promise<ImportJob | null> {
  const res = await fetch(`${API_URL}/import/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function cancelImport(): Promise<void> {
  await fetch(`${API_URL}/import/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function getImportJobs(size = 20, offset = 0): Promise<ImportJob[]> {
  const res = await fetch(
    `${API_URL}/import/jobs?size=${size}&offset=${offset}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  return res.json();
}
