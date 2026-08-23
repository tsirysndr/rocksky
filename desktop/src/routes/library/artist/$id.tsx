import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryArtist } from "../../../pages/library";

export const Route = createFileRoute("/library/artist/$id")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: LibraryArtist,
});
