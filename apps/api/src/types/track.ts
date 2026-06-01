import z from "zod";

// Replace the curly right single quotation mark (U+2019, `’`) with the ASCII
// apostrophe (U+0027, `'`) so artists like "Guns N’ Roses" and "Guns N' Roses"
// collapse to a single canonical form. Mirrors `normalize_text` in
// crates/mirror/src/track.rs.
const canonicalText = z
  .string()
  .nonempty()
  .trim()
  .transform((s) => s.replace(/’/g, "'"));

export const trackSchema = z.object({
  title: canonicalText,
  artist: canonicalText,
  artists: z
    .array(
      z.object({
        mbid: z.string().optional().nullable(),
        name: canonicalText,
      }),
    )
    .optional()
    .nullable(),
  album: canonicalText,
  albumArtist: canonicalText,
  duration: z.number(),
  mbId: z.string().optional().nullable(),
  isrc: z.string().optional().nullable(),
  albumArt: z.string().optional().nullable(),
  trackNumber: z.number().optional().nullable(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Use YYYY-MM-DD.")
    .transform((v) => new Date(v))
    .optional()
    .nullable(),

  year: z.number().optional().nullable(),
  discNumber: z.number().optional().nullable(),
  lyrics: z.string().optional().nullable(),
  composer: z.string().optional().nullable(),
  copyrightMessage: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  artistPicture: z.string().optional().nullable(),
  spotifyLink: z.string().optional().nullable(),
  lastfmLink: z.string().optional().nullable(),
  youtubeLink: z.string().optional().nullable(),
  tidalLink: z.string().optional().nullable(),
  appleMusicLink: z.string().optional().nullable(),
  deezerLink: z.string().optional().nullable(),
  timestamp: z.number().optional().nullable(),
  genres: z.array(z.string()).optional().nullable(),
});

export type Track = z.infer<typeof trackSchema>;

export type MusicbrainzTrack = {
  trackMBID: string;
  releaseMBID: string;
  name: string;
  artist: {
    id: string;
    mbid: string;
    name: string;
  }[];
  album: string;
  timestamp: string;
};
