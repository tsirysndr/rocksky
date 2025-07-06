import { createFileRoute } from "@tanstack/react-router";
import DropboxWithIdPage from "../pages/dropbox/DropboxWithId";

export const Route = createFileRoute("/dropbox/$id")({
  component: DropboxWithIdPage,
});
