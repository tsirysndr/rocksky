import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Track } from "types/track";

export class SubmissionUnavailable extends Error {}

export function validSubmissionSecret(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided || expected.length < 32) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Generated once by Rust and saved with the job; respect the lexicon's TID key.
export function submissionRecordKey(key: unknown): string {
  if (
    typeof key !== "string" ||
    !/^[234567ab][234567abcdefghijklmnopqrstuvwxyz]{12}$/.test(key)
  )
    throw new Error("Invalid submission record key");
  return key;
}

export function submissionInput(
  did: string,
  track: Track,
  explicitKey?: string,
) {
  // The transport schema accepts YYYY-MM-DD, whereas trackSchema produces Date.
  const payload = {
    ...track,
    releaseDate:
      track.releaseDate?.toISOString().slice(0, 10) ?? track.releaseDate,
  };
  const key =
    explicitKey ||
    (track.timestamp
      ? createHash("sha256")
          .update(
            JSON.stringify([
              did,
              track.title.toLowerCase(),
              track.artist.toLowerCase(),
              track.album.toLowerCase(),
              track.timestamp,
            ]),
          )
          .digest("hex")
      : randomUUID());
  return { did, track: payload, idempotencyKey: key };
}

export async function enqueueSubmission(
  config: { url: string; secret: string },
  did: string,
  track: Track,
  explicitKey?: string,
): Promise<string> {
  if (!config.url || config.secret.length < 32)
    throw new SubmissionUnavailable("Durable submissions are not configured");
  const input = submissionInput(did, track, explicitKey);
  try {
    const response = await fetch(
      `${config.url.replace(/\/$/, "")}/v1/submissions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rocksky-submissions-secret": config.secret,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      },
    );
    if (response.status !== 202)
      throw new Error(`Queue returned ${response.status}`);
    const job = (await response.json()) as { id?: string };
    if (!job.id || !/^[a-f0-9]{64}$/.test(job.id))
      throw new Error("Invalid queue acknowledgement");
    return job.id;
  } catch {
    // Never fall back to an in-memory pipeline, and never expose the secret.
    throw new SubmissionUnavailable(
      "Submission could not be durably accepted; retry with the same timestamp or Idempotency-Key",
    );
  }
}
