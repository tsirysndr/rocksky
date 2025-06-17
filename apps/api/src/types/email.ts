import z from "zod";

export const emailSchema = z.object({
  email: z.string().nonempty().email(),
});

export type Email = z.infer<typeof emailSchema>;
