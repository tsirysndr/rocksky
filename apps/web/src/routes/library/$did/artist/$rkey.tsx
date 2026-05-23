import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryArtist } from "../../../../pages/library";

export const Route = createFileRoute("/library/$did/artist/$rkey")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: LibraryArtist,
});
