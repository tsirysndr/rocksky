import { createFileRoute } from "@tanstack/react-router";
import SongPage from "../pages/song";

export const Route = createFileRoute("/scrobble")({
  component: SongPage,
});
