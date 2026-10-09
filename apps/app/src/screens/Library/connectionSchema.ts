import { z } from "zod";
import type { LibrarySource } from "../../api/remoteLibraries";

export const connectionSchema = (existing?: LibrarySource) =>
  z
    .object({
      id: z.string().optional(),
      kind: z.enum(["navidrome", "jellyfin", "upnp", "kodi", "plex"]),
      name: z.string().trim().min(1, "Enter a library name."),
      baseUrl: z
        .string()
        .trim()
        .min(1, "Enter a server URL.")
        .superRefine((value, ctx) => {
          try {
            const url = new URL(value);
            if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
              throw new Error();
            if (url.username || url.password || url.search || url.hash) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Use a URL without credentials, query parameters or a fragment.",
              });
            }
          } catch {
            if (value)
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Enter a valid http:// or https:// URL.",
              });
          }
        }),
      username: z.string().trim(),
      password: z.string(),
      token: z.string().trim(),
    })
    .superRefine((values, ctx) => {
      const reuse =
        existing &&
        existing.kind === values.kind &&
        existing.baseUrl.replace(/\/+$/, "") ===
          values.baseUrl.replace(/\/+$/, "") &&
        existing.username === values.username;
      if (["navidrome", "jellyfin"].includes(values.kind) && !values.username) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "Enter your username.",
        });
      }
      if (values.kind === "navidrome" && !reuse && !values.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Enter your password.",
        });
      }
      if (values.kind === "plex" && !reuse && !values.token) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["token"],
          message: "Enter your Plex token.",
        });
      }
    });
export type ConnectionForm = z.infer<ReturnType<typeof connectionSchema>>;
