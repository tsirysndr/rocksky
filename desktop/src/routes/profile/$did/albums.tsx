import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "../../../pages/profile";

export const Route = createFileRoute("/profile/$did/albums")({
  component: () => <ProfilePage activeKey="1/2" />,
});
