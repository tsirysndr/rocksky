import { createFileRoute } from "@tanstack/react-router";
import AlbumPage from "../pages/album";

export const Route = createFileRoute("/$did/album/$rkey")({
  component: AlbumPage,
});
