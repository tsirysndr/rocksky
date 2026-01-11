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

export namespace Lastfm {
  /* -------------------------------- Legacy API Schemas -------------------------------- */

  export const LegacyNowPlayingRequestSchema = z.object({
    s: z.string(), // session ID
    a: z.string(), // artist
    t: z.string(), // track
    b: z.string().optional(), // album
    l: z.string().optional(), // length in seconds
    n: z.string().optional(), // track number
    m: z.string().optional(), // MusicBrainz ID
  });

  export const LegacySubmissionRequestSchema = z.object({
    s: z.string(), // session ID
    "a[0]": z.string(), // artist
    "t[0]": z.string(), // track
    "i[0]": z.string(), // timestamp
    "o[0]": z.string().optional(), // source (P/R/E/L/U/B)
    "r[0]": z.string().optional(), // rating (L/B/S)
    "l[0]": z.string().optional(), // length in seconds
    "b[0]": z.string().optional(), // album
    "n[0]": z.string().optional(), // track number
    "m[0]": z.string().optional(), // MusicBrainz ID
  });

  /* -------------------------------- Auth Request -------------------------------- */

  export const AuthRequestSchema = z.object({
    method: z.string(),
    api_key: z.string(),
    api_sig: z.string(),
    format: z.string().optional(),
  });

  /* -------------------------------- Auth GetSession Request -------------------------------- */

  export const AuthGetSessionRequestSchema = z.object({
    method: z.literal("auth.getSession"),
    api_key: z.string(),
    token: z.string(),
    api_sig: z.string(),
    format: z.string().optional(),
  });

  /* -------------------------------- Auth GetSession Response -------------------------------- */

  export const AuthGetSessionResponseSchema = z.object({
    session: z.object({
      name: z.string(),
      key: z.string(),
      subscriber: z.number(),
    }),
  });

  /* -------------------------------- Track Scrobble Request -------------------------------- */

  export const TrackScrobbleRequestSchema = z.object({
    method: z.literal("track.scrobble"),
    api_key: z.string(),
    api_sig: z.string(),
    sk: z.string(),
    "track[0]": z.string(),
    "artist[0]": z.string(),
    "timestamp[0]": z.string(),
    "album[0]": z.string().optional(),
    "albumArtist[0]": z.string().optional(),
    "duration[0]": z.string().optional(),
    format: z.string().optional(),
  });

  /* -------------------------------- Track Update Now Playing Request -------------------------------- */

  export const TrackUpdateNowPlayingRequestSchema = z.object({
    method: z.literal("track.updateNowPlaying"),
    api_key: z.string(),
    api_sig: z.string(),
    sk: z.string(),
    track: z.string(),
    artist: z.string(),
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    duration: z.string().optional(),
    format: z.string().optional(),
  });

  /* -------------------------------- Scrobble Response -------------------------------- */

  export const ScrobbleResponseSchema = z.object({
    scrobbles: z.object({
      "@attr": z.object({
        accepted: z.number(),
        ignored: z.number(),
      }),
      scrobble: z
        .object({
          artist: z.object({ "#text": z.string() }),
          track: z.object({ "#text": z.string() }),
          album: z.object({ "#text": z.string() }).optional(),
          albumArtist: z.object({ "#text": z.string() }).optional(),
          timestamp: z.string(),
          ignoredMessage: z
            .object({ code: z.string(), "#text": z.string() })
            .optional(),
        })
        .optional(),
    }),
  });

  /* -------------------------------- Error Response -------------------------------- */

  export const ErrorResponseSchema = z.object({
    error: z.number(),
    message: z.string(),
  });

  export type LegacyNowPlayingRequest = z.infer<
    typeof LegacyNowPlayingRequestSchema
  >;
  export type LegacySubmissionRequest = z.infer<
    typeof LegacySubmissionRequestSchema
  >;
  export type AuthRequest = z.infer<typeof AuthRequestSchema>;
  export type AuthGetSessionRequest = z.infer<
    typeof AuthGetSessionRequestSchema
  >;
  export type AuthGetSessionResponse = z.infer<
    typeof AuthGetSessionResponseSchema
  >;
  export type TrackScrobbleRequest = z.infer<typeof TrackScrobbleRequestSchema>;
  export type TrackUpdateNowPlayingRequest = z.infer<
    typeof TrackUpdateNowPlayingRequestSchema
  >;
  export type ScrobbleResponse = z.infer<typeof ScrobbleResponseSchema>;
  export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
}

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

  export type Payload = z.infer<typeof PayloadSchema>;
  export type SubmitListensRequest = z.infer<typeof SubmitListensRequestSchema>;
  export type SubmitListensResponse = z.infer<
    typeof SubmitListensResponseSchema
  >;
  export type ValidateTokenResponse = z.infer<
    typeof ValidateTokenResponseSchema
  >;
}
