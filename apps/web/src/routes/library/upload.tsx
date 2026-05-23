import { createFileRoute, redirect } from "@tanstack/react-router";
import { Upload } from "../../pages/library";

export const Route = createFileRoute("/library/upload")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: Upload,
});
