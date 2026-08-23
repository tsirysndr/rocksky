import { createFileRoute } from "@tanstack/react-router";
import GoogleDrive from "../../pages/googledrive";

export const Route = createFileRoute("/googledrive/")({
  component: GoogleDrive,
});
