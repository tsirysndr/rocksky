import { createFileRoute } from "@tanstack/react-router";
import TosPage from "../pages/tos";

export const Route = createFileRoute("/tos")({
  component: TosPage,
});
