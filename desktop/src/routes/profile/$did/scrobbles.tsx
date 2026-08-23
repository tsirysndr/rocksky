import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/scrobbles")({
  component: () => <ProfilePage activeKey="1" />,
});
