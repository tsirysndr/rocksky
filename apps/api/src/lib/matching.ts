import { createHash } from "node:crypto";
import { consola } from "consola";
import type { Context } from "context";
import { z } from "zod";

const identifiersSchema = z.object({
  musicbrainzRecordingId: z.string().nullish(),
  musicbrainzReleaseId: z.string().nullish(),
  isrc: z.string().nullish(),
  spotifyTrackId: z.string().nullish(),
  deezerTrackId: z.string().nullish(),
});
export const candidateSchema = z.object({
  source: z.string(),
  id: z.string(),
  title: z.string(),
  artists: z.array(z.string()).min(1),
  album: z.string().nullish(),
  albumArtist: z.string().nullish(),
  durationMs: z.number().nullish(),
  albumArt: z.string().nullish(),
  releaseDate: z.string().nullish(),
  identifiers: identifiersSchema,
  trackNumber: z.number().nullish(),
  discNumber: z.number().nullish(),
  label: z.string().nullish(),
  genres: z.array(z.string()).nullish(),
  artistPicture: z.string().nullish(),
  musicbrainzArtists: z
    .array(z.object({ mbid: z.string(), name: z.string() }))
    .nullish(),
  spotifyLink: z.string().nullish(),
});
export type MatchedCandidate = z.infer<typeof candidateSchema>;
export interface MatchingRequest {
  title: string;
  artists: string[];
  album?: string;
  albumArtist?: string;
  durationMs?: number;
  identifiers?: z.infer<typeof identifiersSchema>;
}
const responseSchema = z
  .object({
    policyVersion: z.string(),
    status: z.enum(["matched", "ambiguous", "unmatched"]),
    track: candidateSchema.nullable(),
    warnings: z.array(z.string()).default([]),
  })
  .superRefine((response, ctx) => {
    if ((response.status === "matched") !== (response.track !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid matching status/track combination",
      });
    }
  });

export const optionalText = (value?: string | null) =>
  value?.trim() || undefined;
export function spotifyTrackId(value?: string | null): string | undefined {
  if (!value) return undefined;
  let id = value.trim();
  if (id.startsWith("spotify:track:")) id = id.slice("spotify:track:".length);
  else if (id.includes("://")) {
    try {
      const url = new URL(id);
      if (url.hostname !== "open.spotify.com") return undefined;
      id = /^\/track\/([^/]+)$/.exec(url.pathname)?.[1] ?? "";
    } catch {
      return undefined;
    }
  }
  return /^[A-Za-z0-9]{22}$/.test(id) ? id : undefined;
}
export function matchingRequest(track: {
  title?: string;
  artist?: string;
  artists?: { name?: string }[] | null;
  album?: string | null;
  albumArtist?: string | null;
  duration?: number;
  mbId?: string | null;
  isrc?: string | null;
  spotifyLink?: string | null;
}): MatchingRequest {
  if (!track.title?.trim() || !track.artist?.trim())
    throw new Error("Matching requires title and artist");
  return {
    title: track.title,
    // Preserve literal comma-containing band names. The service handles joined credits.
    artists: track.artists?.length
      ? track.artists.map((a) => a.name ?? "")
      : [track.artist],
    album: optionalText(track.album),
    albumArtist: optionalText(track.albumArtist),
    durationMs:
      track.duration && track.duration > 1
        ? Math.round(track.duration)
        : undefined,
    identifiers: {
      musicbrainzRecordingId: optionalText(track.mbId),
      isrc: optionalText(track.isrc),
      spotifyTrackId: spotifyTrackId(track.spotifyLink),
    },
  };
}

export async function resolveMatch(
  ctx: Pick<Context, "matching">,
  request: MatchingRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { data } = await ctx.matching.post("/v1/match", request, { signal });
  const response = responseSchema.parse(data);
  if (response.warnings.length)
    consola.warn("Matching provider warnings:", response.warnings);
  return response;
}

export async function matchTrack(
  ctx: Pick<Context, "matching">,
  request: MatchingRequest,
  signal?: AbortSignal,
): Promise<MatchedCandidate | null> {
  // Transport failures propagate. Ambiguity is not permission to pick candidates[0].
  return (await resolveMatch(ctx, request, signal)).track;
}

export function matchingCacheKey(request: MatchingRequest): string {
  return `matching:v1:${createHash("sha256").update(JSON.stringify(request)).digest("hex")}`;
}
export function candidateMetadata(c: MatchedCandidate) {
  const releaseDate =
    c.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate)
      ? new Date(c.releaseDate)
      : undefined;
  return {
    mbId: c.identifiers.musicbrainzRecordingId,
    isrc: c.identifiers.isrc,
    albumArt: c.albumArt,
    duration: c.durationMs,
    trackNumber: c.trackNumber,
    discNumber: c.discNumber,
    label: c.label,
    genres: c.genres,
    artistPicture: c.artistPicture,
    releaseDate,
    year: c.releaseDate
      ? Number.parseInt(c.releaseDate, 10) || undefined
      : undefined,
    spotifyLink:
      c.spotifyLink ??
      (c.identifiers.spotifyTrackId
        ? `https://open.spotify.com/track/${c.identifiers.spotifyTrackId}`
        : undefined),
    deezerLink: c.identifiers.deezerTrackId
      ? `https://www.deezer.com/track/${c.identifiers.deezerTrackId}`
      : undefined,
  };
}
