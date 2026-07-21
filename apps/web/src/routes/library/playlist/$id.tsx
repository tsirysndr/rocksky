import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryPlaylist } from "../../../pages/library";

export const Route = createFileRoute("/library/playlist/$id")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: LibraryPlaylist,
});
