import { createFileRoute } from "@tanstack/react-router";
import ChartsPage from "../pages/charts";

export const Route = createFileRoute("/charts")({
  component: ChartsPage,
});
