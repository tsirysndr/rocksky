import { createFileRoute } from "@tanstack/react-router";
import ApiKeysPage from "../pages/apikeys";

export const Route = createFileRoute("/apikeys")({
  component: ApiKeysPage,
});
