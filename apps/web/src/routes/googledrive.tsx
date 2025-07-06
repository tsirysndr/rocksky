import { createFileRoute } from "@tanstack/react-router";
import GoogleDrivePage from "../pages/googledrive";

export const Route = createFileRoute("/googledrive")({
  component: GoogleDrivePage,
});
