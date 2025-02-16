import z from "zod";

export const shoutSchema = z.object({
  message: z.string().nonempty(),
});

export type Shout = z.infer<typeof shoutSchema>;
