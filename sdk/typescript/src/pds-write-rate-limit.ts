/** A server-reported record-write point budget, never an SDK estimate. */
export interface PdsWriteRateLimit {
  readonly limit: number;
  readonly remaining: number;
  /** Unix epoch seconds. */
  readonly resetAt: number;
  readonly policy: string;
}

/** Only recognized PDS write-point policies; generic HTTP quotas are excluded. */
export function parsePdsWriteRateLimit(headers?: Headers): PdsWriteRateLimit | null {
  if (!headers) return null;
  const policy = headers.get("ratelimit-policy")?.trim();
  if (policy !== "5000;w=3600" && policy !== "35000;w=86400") return null;
  const read = (name: string): number | null => {
    const value = headers.get(name)?.trim();
    if (!value || !/^\d+$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  };
  const limit = read("ratelimit-limit");
  const remaining = read("ratelimit-remaining");
  const resetAt = read("ratelimit-reset");
  if (limit === null || remaining === null || resetAt === null || remaining > limit ||
      limit !== Number(policy.split(";")[0])) return null;
  return Object.freeze({ limit, remaining, resetAt, policy });
}

/** Result of an actual write or a local dedup hit. */
export interface WriteResult {
  readonly uri: string;
  readonly pdsWriteRateLimit: PdsWriteRateLimit | null;
  readonly written: boolean;
}

export interface DeleteResult {
  readonly pdsWriteRateLimit: PdsWriteRateLimit | null;
}
