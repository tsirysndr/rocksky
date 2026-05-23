import { createFileRoute } from "@tanstack/react-router";
import { LibraryArtist } from "../../../../pages/library";

export const Route = createFileRoute("/library/$did/artist/$rkey")({
  component: LibraryArtist,
});
