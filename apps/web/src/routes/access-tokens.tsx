import { createFileRoute } from "@tanstack/react-router";
import AccessTokensPage from "../pages/access-tokens";

export const Route = createFileRoute("/access-tokens")({
  component: AccessTokensPage,
});
