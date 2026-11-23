import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Only display metadata is stored here: never session tokens or API keys.
// A fresh QueryClient (or CLI restart) can show a saved page immediately while
// the existing query refreshes it in the background.
const snapshots = new Map<string, { data: unknown; updatedAt: number }>();
const MAX_AGE = 24 * 60 * 60 * 1000;
function location(token: string, key: string) {
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  return path.join(
    os.homedir(),
    ".rocksky",
    "library-cache",
    hash(token),
    `${hash(key)}.json`,
  );
}
export function readMetadata<T>(
  token: string,
  key: string,
): { data: T; updatedAt: number } | undefined {
  if (!token) return;
  const file = location(token, key);
  try {
    const entry =
      snapshots.get(file) ?? JSON.parse(fs.readFileSync(file, "utf8"));
    if (entry.version !== undefined && entry.version !== 1) return;
    if (
      !Number.isFinite(entry.updatedAt) ||
      entry.updatedAt > Date.now() ||
      Date.now() - entry.updatedAt > MAX_AGE
    )
      return;
    snapshots.set(file, entry);
    return entry;
  } catch {
    return;
  }
}
export function saveMetadata<T>(token: string, key: string, data: T) {
  if (!token) return;
  const file = location(token, key);
  const entry = { version: 1, data, updatedAt: Date.now() };
  snapshots.set(file, entry);
  try {
    const json = JSON.stringify(entry);
    if (Buffer.byteLength(json) > 2 * 1024 * 1024) return;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, json, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {
    /* A read-only cache directory must not stop browsing. */
  }
}
export function metadataQuery<T>(
  token: string,
  queryKey: readonly unknown[],
  load: () => Promise<T>,
) {
  // Token is already separated into the owner directory; omit it from the key.
  const key = JSON.stringify(queryKey.filter((value) => value !== token));
  const saved = readMetadata<T>(token, key);
  return {
    queryKey,
    enabled: !!token,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: false as const,
    initialData: saved?.data,
    initialDataUpdatedAt: saved?.updatedAt,
    queryFn: async () => {
      const data = await load();
      saveMetadata(token, key, data);
      return data;
    },
  };
}
