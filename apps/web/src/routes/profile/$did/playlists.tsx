import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/playlists")({
  component: () => <ProfilePage activeKey="2" />,
});
