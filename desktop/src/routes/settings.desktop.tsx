import { createFileRoute } from "@tanstack/react-router";
import SettingsDesktop from "../pages/settings/desktop";

export const Route = createFileRoute("/settings/desktop")({
  component: SettingsDesktop,
});
