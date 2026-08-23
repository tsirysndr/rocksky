import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/playlists")({
  // Tab order: 0 Overview, 1 Library, 2 Followers, 3 Following, 4 Circles,
  // 5 Loved Tracks, 6 Playlists.
  component: () => <ProfilePage activeKey="6" />,
});
