import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/likes")({
  component: () => <ProfilePage activeKey="3" />,
});
