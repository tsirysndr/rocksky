import z from "zod";

export const trackSchema = z.object({
  title: z.string().nonempty().trim(),
  artist: z.string().nonempty().trim(),
  artists: z
    .array(
      z.object({
        mbid: z.string().optional().nullable(),
        name: z.string().nonempty().trim(),
      }),
    )
    .optional()
    .nullable(),
  album: z.string().nonempty().trim(),
  albumArtist: z.string().nonempty().trim(),
  duration: z.number(),
  mbId: z.string().optional().nullable(),
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
  isrc: z.string().optional().nullable(),
  spotifyId: z.string().optional().nullable(),
  tidalId: z.string().optional().nullable(),
  appleMusicId: z.string().optional().nullable(),
  deezerId: z.string().optional().nullable(),
  spotifyArtistId: z.string().optional().nullable(),
  tidalArtistId: z.string().optional().nullable(),
  appleMusicArtistId: z.string().optional().nullable(),
  deezerArtistId: z.string().optional().nullable(),
  spotifyAlbumId: z.string().optional().nullable(),
  tidalAlbumId: z.string().optional().nullable(),
  appleMusicAlbumId: z.string().optional().nullable(),
  deezerAlbumId: z.string().optional().nullable(),
  artistRoles: z.array(z.string()).optional().nullable(),
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
