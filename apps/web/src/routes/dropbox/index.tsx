import { createFileRoute } from "@tanstack/react-router";
import Dropbox from "../../pages/dropbox";

export const Route = createFileRoute("/dropbox/")({
  component: Dropbox,
});
