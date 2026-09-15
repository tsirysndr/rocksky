import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";
import HomePage from "../pages/home";

export const HomePageSchema = z.object({
  did: z.string().optional(),
  cli: z.number().optional(),
  // Set by the session guard when it signs the user out; without it here,
  // validateSearch would strip the key before anything could read it.
  session: z.literal("expired").optional(),
});

export const Route = createFileRoute("/")({
  component: HomePage,
  validateSearch: zodValidator(HomePageSchema),
});
