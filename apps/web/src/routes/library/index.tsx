import { createFileRoute, redirect } from "@tanstack/react-router";
import { Library } from "../../pages/library";

export const Route = createFileRoute("/library/")({
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: Library,
});
