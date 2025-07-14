import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/tags")({
  component: () => <ProfilePage activeKey="4" />,
});
