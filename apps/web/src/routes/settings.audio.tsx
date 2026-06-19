import { createFileRoute } from "@tanstack/react-router";
import SettingsAudio from "../pages/settings/audio";

export const Route = createFileRoute("/settings/audio")({
  component: SettingsAudio,
});
