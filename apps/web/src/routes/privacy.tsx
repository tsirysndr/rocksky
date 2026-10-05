import { createFileRoute, redirect } from "@tanstack/react-router";

// There is no separate privacy policy; the terms cover data handling.
export const Route = createFileRoute("/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/tos", replace: true });
  },
});
