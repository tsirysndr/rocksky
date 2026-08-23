import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryAlbum } from "../../../pages/library";

export const Route = createFileRoute("/library/album/$id")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: LibraryAlbum,
});
