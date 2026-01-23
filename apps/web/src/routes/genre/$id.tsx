import { createFileRoute } from "@tanstack/react-router";
import GenrePage from "../../pages/genre";

export const Route = createFileRoute("/genre/$id")({
  component: GenrePage,
});
