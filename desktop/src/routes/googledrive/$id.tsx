import { createFileRoute } from "@tanstack/react-router";
import GoogleDriveWithIdPage from "../../pages/googledrive/GoogleDriveWithId";

export const Route = createFileRoute("/googledrive/$id")({
  component: GoogleDriveWithIdPage,
});
