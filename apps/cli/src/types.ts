import { z } from "zod";

export namespace WebScrobbler {
  /* -------------------------------- Connector -------------------------------- */

  export const ConnectorSchema = z.object({
    id: z.string(),
    js: z.string(),
    label: z.string(),
    matches: z.array(z.string()),
  });

  /* ----------------------- IsRegrexEditedByUser ----------------------- */

  export const IsRegrexEditedByUserSchema = z.object({
    album: z.boolean(),
    albumArtist: z.boolean(),
    artist: z.boolean(),
    track: z.boolean(),
  });

  /* ---------------------------------- Flags ---------------------------------- */

  export const FlagsSchema = z.object({
    finishedProcessing: z.boolean(),
    hasBlockedTag: z.boolean(),
    isAlbumFetched: z.boolean(),
    isCorrectedByUser: z.boolean(),
    isLovedInService: z.boolean().optional(),
    isMarkedAsPlaying: z.boolean(),
    isRegexEditedByUser: IsRegrexEditedByUserSchema,
    isReplaying: z.boolean(),
    isScrobbled: z.boolean(),
    isSkipped: z.boolean(),
    isValid: z.boolean(),
  });

  /* -------------------------------- Metadata -------------------------------- */

  export const MetadataSchema = z.object({
    albumUrl: z.string().url().optional(),
    artistUrl: z.string().url().optional(),
    label: z.string(),
    startTimestamp: z.number().int().nonnegative(),
    trackUrl: z.string().url().optional(),
    userPlayCount: z.number().int().nonnegative().optional(),
    userloved: z.boolean().optional(),
  });

  /* -------------------------------- NoRegex -------------------------------- */

  export const NoRegexSchema = z.object({
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    artist: z.string(),
    duration: z.number().int().nonnegative().optional(),
    track: z.string(),
  });

  /* ---------------------------------- Parsed --------------------------------- */

  export const ParsedSchema = z.object({
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    artist: z.string(),
    currentTime: z.number().int().nonnegative().optional(),
    duration: z.number().int().nonnegative().optional(),
    isPlaying: z.boolean(),
    isPodcast: z.boolean(),
    originUrl: z.string().url().optional(),
    scrobblingDisallowedReason: z.string().optional(),
    track: z.string(),
    trackArt: z.string().url().optional(),
    uniqueID: z.string().optional(),
  });

  /* ----------------------------------- Song ---------------------------------- */

  export const SongSchema = z.object({
    connector: ConnectorSchema,
    controllerTabId: z.number().int().nonnegative(),
    flags: FlagsSchema,
    metadata: MetadataSchema,
    noRegex: NoRegexSchema,
    parsed: ParsedSchema,
  });

  /* -------------------------------- Processed -------------------------------- */

  export const ProcessedSchema = z.object({
    album: z.string(),
    albumArtist: z.string().optional(),
    artist: z.string(),
    duration: z.number().int().nonnegative(),
    track: z.string(),
  });

  /* --------------------------------- Scrobble -------------------------------- */

  export const ScrobbleSchema = z.object({
    song: SongSchema,
  });

  /* ------------------------------ ScrobbleRequest ----------------------------- */

  export const ScrobbleRequestSchema = z.object({
    data: ScrobbleSchema,
    eventName: z.string(),
    time: z.number().int().nonnegative(),
  });

  export type Song = z.infer<typeof SongSchema>;
  export type Processed = z.infer<typeof ProcessedSchema>;
  export type Scrobble = z.infer<typeof ScrobbleSchema>;
  export type ScrobbleRequest = z.infer<typeof ScrobbleRequestSchema>;
  export type ScrobbleRequestData = z.infer<
    typeof ScrobbleRequestSchema
  >["data"];
}

export namespace Lastfm {}

export namespace Listenbrainz {
  /* -------------------------------- TrackMetadata -------------------------------- */

  export const TrackMetadataSchema = z.object({
    artist_name: z.string(),
    track_name: z.string(),
    release_name: z.string().optional(),
    additional_info: z.record(z.any()).optional(),
  });

  /* -------------------------------- Payload -------------------------------- */

  export const PayloadSchema = z.object({
    listened_at: z.number().int().nonnegative().optional(),
    track_metadata: TrackMetadataSchema,
  });

  /* -------------------------------- SubmitListensRequest -------------------------------- */

  export const SubmitListensRequestSchema = z.object({
    listen_type: z.enum(["single", "playing_now", "import"]),
    payload: z.array(PayloadSchema),
  });

  /* -------------------------------- SubmitListensResponse -------------------------------- */

  export const SubmitListensResponseSchema = z.object({
    status: z.string(),
    code: z.number().int(),
  });

  /* -------------------------------- ValidateTokenResponse -------------------------------- */

  export const ValidateTokenResponseSchema = z.object({
    code: z.number().int(),
    message: z.string(),
    valid: z.boolean(),
    user_name: z.string().optional(),
  });

  export type TrackMetadata = z.infer<typeof TrackMetadataSchema>;
  export type Listen = z.infer<typeof ListenSchema>;
  export type Payload = z.infer<typeof PayloadSchema>;
  export type SubmitListensRequest = z.infer<typeof SubmitListensRequestSchema>;
  export type SubmitListensResponse = z.infer<
    typeof SubmitListensResponseSchema
  >;
  export type ValidateTokenResponse = z.infer<
    typeof ValidateTokenResponseSchema
  >;
}
