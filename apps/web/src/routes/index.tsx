import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";
import HomePage from "../pages/home";

export const HomePageSchema = z.object({
  did: z.string().optional(),
  cli: z.string().optional(),
});

export const Route = createFileRoute("/")({
  component: HomePage,
  validateSearch: zodValidator(HomePageSchema),
});
