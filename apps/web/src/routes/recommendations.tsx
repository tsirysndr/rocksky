import { createFileRoute } from "@tanstack/react-router";
import RecommendationsPage from "../pages/recommendations";

export const Route = createFileRoute("/recommendations")({
  component: RecommendationsPage,
});
