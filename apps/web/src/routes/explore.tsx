import { createFileRoute } from "@tanstack/react-router";
import ExplorerPage from "../pages/explorer";

export const Route = createFileRoute("/explore")({
  component: ExplorerPage,
});
