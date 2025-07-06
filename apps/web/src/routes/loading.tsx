import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";
import LoadingPage from "../pages/loading";

const validateSearch = z.object({
  handle: z.string(),
});

export const Route = createFileRoute("/loading")({
  component: LoadingPage,
  validateSearch: zodValidator(validateSearch),
});
