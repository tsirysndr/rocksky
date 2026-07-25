import z from "zod";

export const gifSchema = z.object({
  url: z.string().url(),
  previewUrl: z.string().url().optional(),
  alt: z.string().max(512).optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
});

export type Gif = z.infer<typeof gifSchema>;

export const mentionSchema = z.object({
  did: z.string(),
  byteStart: z.number().int().min(0),
  byteEnd: z.number().int().min(0),
});

export type Mention = z.infer<typeof mentionSchema>;

export const shoutSchema = z
  .object({
    message: z.string().max(1000).optional(),
    gif: gifSchema.optional(),
    facets: z.array(mentionSchema).optional(),
  })
  .refine((v) => (v.message?.trim().length ?? 0) > 0 || v.gif != null, {
    message: "A shout must have a message or a gif.",
  });

export type Shout = z.infer<typeof shoutSchema>;
