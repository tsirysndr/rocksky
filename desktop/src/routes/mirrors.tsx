import { createFileRoute } from "@tanstack/react-router";
import MirrorsPage from "../pages/mirrors";

export const Route = createFileRoute("/mirrors")({
  component: MirrorsPage,
});
