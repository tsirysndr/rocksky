import { createFileRoute } from "@tanstack/react-router";
import ArtistPage from "../pages/artist";

export const Route = createFileRoute("/$did/artist/$rkey")({
  component: ArtistPage,
});
