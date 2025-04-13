import z from "zod";

export const apiKeySchema = z.object({
  name: z.string().nonempty(),
  description: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export type ApiKey = z.infer<typeof apiKeySchema>;
