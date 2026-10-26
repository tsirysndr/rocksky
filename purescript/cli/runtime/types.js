import { z } from "zod";
var WebScrobbler;
((WebScrobbler2) => {
  WebScrobbler2.ConnectorSchema = z.object({
    id: z.string(),
    js: z.string(),
    label: z.string(),
    matches: z.array(z.string())
  });
  WebScrobbler2.IsRegrexEditedByUserSchema = z.object({
    album: z.boolean(),
    albumArtist: z.boolean(),
    artist: z.boolean(),
    track: z.boolean()
  });
  WebScrobbler2.FlagsSchema = z.object({
    finishedProcessing: z.boolean(),
    hasBlockedTag: z.boolean(),
    isAlbumFetched: z.boolean(),
    isCorrectedByUser: z.boolean(),
    isLovedInService: z.boolean().optional(),
    isMarkedAsPlaying: z.boolean(),
    isRegexEditedByUser: WebScrobbler2.IsRegrexEditedByUserSchema,
    isReplaying: z.boolean(),
    isScrobbled: z.boolean(),
    isSkipped: z.boolean(),
    isValid: z.boolean()
  });
  WebScrobbler2.MetadataSchema = z.object({
    albumUrl: z.string().url().optional(),
    artistUrl: z.string().url().optional(),
    label: z.string(),
    startTimestamp: z.number().int().nonnegative(),
    trackUrl: z.string().url().optional(),
    userPlayCount: z.number().int().nonnegative().optional(),
    userloved: z.boolean().optional()
  });
  WebScrobbler2.NoRegexSchema = z.object({
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    artist: z.string(),
    duration: z.number().int().nonnegative().optional(),
    track: z.string()
  });
  WebScrobbler2.ParsedSchema = z.object({
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
    uniqueID: z.string().optional()
  });
  WebScrobbler2.SongSchema = z.object({
    connector: WebScrobbler2.ConnectorSchema,
    controllerTabId: z.number().int().nonnegative(),
    flags: WebScrobbler2.FlagsSchema,
    metadata: WebScrobbler2.MetadataSchema,
    noRegex: WebScrobbler2.NoRegexSchema,
    parsed: WebScrobbler2.ParsedSchema
  });
  WebScrobbler2.ProcessedSchema = z.object({
    album: z.string(),
    albumArtist: z.string().optional(),
    artist: z.string(),
    duration: z.number().int().nonnegative(),
    track: z.string()
  });
  WebScrobbler2.ScrobbleSchema = z.object({
    song: WebScrobbler2.SongSchema
  });
  WebScrobbler2.ScrobbleRequestSchema = z.object({
    data: WebScrobbler2.ScrobbleSchema,
    eventName: z.string(),
    time: z.number().int().nonnegative()
  });
})(WebScrobbler || (WebScrobbler = {}));
var Lastfm;
((Lastfm2) => {
  Lastfm2.LegacyNowPlayingRequestSchema = z.object({
    s: z.string(),
    // session ID
    a: z.string(),
    // artist
    t: z.string(),
    // track
    b: z.string().optional(),
    // album
    l: z.string().optional(),
    // length in seconds
    n: z.string().optional(),
    // track number
    m: z.string().optional()
    // MusicBrainz ID
  });
  Lastfm2.LegacySubmissionRequestSchema = z.object({
    s: z.string(),
    // session ID
    "a[0]": z.string(),
    // artist
    "t[0]": z.string(),
    // track
    "i[0]": z.string(),
    // timestamp
    "o[0]": z.string().optional(),
    // source (P/R/E/L/U/B)
    "r[0]": z.string().optional(),
    // rating (L/B/S)
    "l[0]": z.string().optional(),
    // length in seconds
    "b[0]": z.string().optional(),
    // album
    "n[0]": z.string().optional(),
    // track number
    "m[0]": z.string().optional()
    // MusicBrainz ID
  });
  Lastfm2.AuthRequestSchema = z.object({
    method: z.string(),
    api_key: z.string(),
    api_sig: z.string(),
    format: z.string().optional()
  });
  Lastfm2.AuthGetSessionRequestSchema = z.object({
    method: z.literal("auth.getSession"),
    api_key: z.string(),
    token: z.string(),
    api_sig: z.string(),
    format: z.string().optional()
  });
  Lastfm2.AuthGetSessionResponseSchema = z.object({
    session: z.object({
      name: z.string(),
      key: z.string(),
      subscriber: z.number()
    })
  });
  Lastfm2.TrackScrobbleRequestSchema = z.object({
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
    format: z.string().optional()
  });
  Lastfm2.TrackUpdateNowPlayingRequestSchema = z.object({
    method: z.literal("track.updateNowPlaying"),
    api_key: z.string(),
    api_sig: z.string(),
    sk: z.string(),
    track: z.string(),
    artist: z.string(),
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    duration: z.string().optional(),
    format: z.string().optional()
  });
  Lastfm2.ScrobbleResponseSchema = z.object({
    scrobbles: z.object({
      "@attr": z.object({
        accepted: z.number(),
        ignored: z.number()
      }),
      scrobble: z.object({
        artist: z.object({ "#text": z.string() }),
        track: z.object({ "#text": z.string() }),
        album: z.object({ "#text": z.string() }).optional(),
        albumArtist: z.object({ "#text": z.string() }).optional(),
        timestamp: z.string(),
        ignoredMessage: z.object({ code: z.string(), "#text": z.string() }).optional()
      }).optional()
    })
  });
  Lastfm2.ErrorResponseSchema = z.object({
    error: z.number(),
    message: z.string()
  });
})(Lastfm || (Lastfm = {}));
var Listenbrainz;
((Listenbrainz2) => {
  Listenbrainz2.TrackMetadataSchema = z.object({
    artist_name: z.string(),
    track_name: z.string(),
    release_name: z.string().optional(),
    additional_info: z.record(z.any()).optional()
  });
  Listenbrainz2.PayloadSchema = z.object({
    listened_at: z.number().int().nonnegative().optional(),
    track_metadata: Listenbrainz2.TrackMetadataSchema
  });
  Listenbrainz2.SubmitListensRequestSchema = z.object({
    listen_type: z.enum(["single", "playing_now", "import"]),
    payload: z.array(Listenbrainz2.PayloadSchema)
  });
  Listenbrainz2.SubmitListensResponseSchema = z.object({
    status: z.string(),
    code: z.number().int()
  });
  Listenbrainz2.ValidateTokenResponseSchema = z.object({
    code: z.number().int(),
    message: z.string(),
    valid: z.boolean(),
    user_name: z.string().optional()
  });
})(Listenbrainz || (Listenbrainz = {}));
export {
  Lastfm,
  Listenbrainz,
  WebScrobbler
};
