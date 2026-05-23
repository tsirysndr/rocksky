import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "../../pages/library";

export const Route = createFileRoute("/library/upload")({
  component: Upload,
});
