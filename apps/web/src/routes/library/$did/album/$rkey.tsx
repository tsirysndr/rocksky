import { createFileRoute } from "@tanstack/react-router";
import { LibraryAlbum } from "../../../../pages/library";

export const Route = createFileRoute("/library/$did/album/$rkey")({
  component: LibraryAlbum,
});
