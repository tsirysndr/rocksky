import z from "zod";

export const createAccessTokenSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
});

export type CreateAccessTokenInput = z.infer<typeof createAccessTokenSchema>;
