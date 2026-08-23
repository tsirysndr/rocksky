import { createFileRoute } from "@tanstack/react-router";
import SongPage from "../pages/song";

export const Route = createFileRoute("/$did/scrobble/$rkey")({
  component: SongPage,
});
