import { createFileRoute } from "@tanstack/react-router";
import DropboxPage from "../pages/dropbox";

export const Route = createFileRoute("/dropbox")({
  component: DropboxPage,
});
