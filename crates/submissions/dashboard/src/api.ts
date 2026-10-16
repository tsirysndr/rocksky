export type Status = "pending" | "processing" | "completed" | "failed";
export type Job = {
  id: string;
  kind: string;
  source?: string;
  started_at_ms?: number;
  status: Status;
  attempts: number;
  available_at: number;
  lease_until: number;
  last_error: string;
  created_at: number;
  updated_at: number;
  compacted_at: number;
};
export type Overview = {
  as_of: number;
  live_as_of?: number;
  completed_last_hour?: number;
  backend: string;
  counts: {
    kind: string;
    status: Status;
    count: number;
    oldest_created_at: number;
  }[];
  cursors: { source: string; cursor_value: number }[];
  completions: {
    minute: number;
    kind: string;
    collection?: string;
    count: number;
  }[];
  cleanup: {
    enabled: boolean;
    completed_retention_seconds: number;
    dedup_retention_seconds: number;
    interval_seconds: number;
    batch_size: number;
  };
};
export type LiveActivity = {
  as_of: number;
  since: number;
  processing: Overview["counts"];
  counts: Overview["counts"];
  completed_last_hour: number;
  cursors: Overview["cursors"];
  completions: Overview["completions"];
};

// Replace overlapping minute buckets, including zeros, instead of adding them.
export function mergeActivity(snapshot: Overview, activity?: LiveActivity): Overview {
  if (!activity) return snapshot;
  const hourStart = (Math.floor(activity.as_of / 60) - 59) * 60;
  return {
    ...snapshot,
    live_as_of: activity.as_of,
    counts: [...snapshot.counts.filter(c => c.status === "completed"), ...activity.counts],
    completed_last_hour: activity.completed_last_hour,
    cursors: activity.cursors,
    completions: activity.as_of < snapshot.as_of ? snapshot.completions : [
      ...snapshot.completions.filter(b => b.minute < activity.since && b.minute >= hourStart),
      ...activity.completions,
    ],
  };
}

export type JobPage = { jobs: Job[]; next: string | null };
export type Attempt = {
  attempt: number;
  started_at_ms: number;
  finished_at_ms: number;
  duration_ms: number | null;
  outcome: string;
};
export type Detail = {
  attempts?: Attempt[];
  scrobble?: Record<string, string | number | null> | null;
  job: Job;
  steps: { name: string; completed_at: number }[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  secret: string,
  signal?: AbortSignal,
  method = "GET",
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    credentials: "omit",
    cache: "no-store",
    headers: secret ? { "x-rocksky-submissions-secret": secret } : {},
  });
  if (!response.ok) {
    const message =
      response.status === 401
        ? "Access denied. Check your service secret."
        : response.status === 409
          ? "This job is no longer failed. Refresh its status."
          : response.status === 404
            ? "This job no longer exists. It may have expired under the retention policy."
            : "Unable to reach the queue. Please try again.";
    throw new ApiError(response.status, message);
  }
  return response.status === 202 ? (undefined as T) : response.json();
}
export const kindName = (kind: string) =>
  kind === "jetstream.commit.v1"
    ? "Jetstream"
    : kind === "scrobble.publish.v1"
      ? "Scrobble publication"
      : kind === "tealfm.publish.v1" ? "Teal FM publication" : kind;
export const number = (value: number) => new Intl.NumberFormat().format(value);
export const date = (value: number) =>
  value ? new Date(value * 1000).toLocaleString() : "—";
export function duration(value: number) {
  if (value < 60) return `${Math.max(0, Math.floor(value))}s`;
  if (value < 3600)
    return `${Math.floor(value / 60)}m ${Math.floor(value % 60)}s`;
  if (value < 86400)
    return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  return `${Math.floor(value / 86400)}d`;
}

export function sourceName(source?: string): string {
  const match = source?.match(/^jetstream:(v[12]):(.+)$/);
  if (!match) return "Legacy / unknown source";
  return match[2].replace(/^wss?:\/\//, "");
}
