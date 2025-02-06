import z from "zod";

export const trackSchema = z.object({
  title: z.string().nonempty(),
  artist: z.string().nonempty(),
  album: z.string().nonempty(),
  albumArtist: z.string().nonempty(),
  duration: z.number(),
  mbId: z.string().optional().nullable(),
  albumArt: z.string().optional().nullable(),
  trackNumber: z.number().optional().nullable(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Use YYYY-MM-DD.")
    .transform((v) => new Date(v))
    .optional().nullable(),

  year: z.number().optional().nullable(),
  discNumber: z.number().optional().nullable(),
  lyrics: z.string().optional().nullable(),
  composer: z.string().optional().nullable(),
  copyrightMessage: z.string().optional().nullable(),
});

export type Track = z.infer<typeof trackSchema>;
