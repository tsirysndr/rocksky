import z from "zod";

export const trackSchema = z.object({
  title: z.string().nonempty(),
  artist: z.string().nonempty(),
  album: z.string().nonempty(),
  albumArtist: z.string().nonempty(),
  duration: z.number(),
  mbId: z.string().optional(),
  albumArt: z.string().optional(),
  trackNumber: z.number().optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Use YYYY-MM-DD.")
    .transform((v) => new Date(v))
    .optional(),

  year: z.number().optional(),
  discNumber: z.number().optional().nullable(),
  lyrics: z.string().optional(),
  composer: z.string().optional(),
  copyrightMessage: z.string().optional(),
});

export type Track = z.infer<typeof trackSchema>;
