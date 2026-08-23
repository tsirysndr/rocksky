import { createFileRoute } from "@tanstack/react-router";
import PlaylistPage from "../pages/playlist";

export const Route = createFileRoute("/$did/playlist/$rkey")({
  component: PlaylistPage,
});
