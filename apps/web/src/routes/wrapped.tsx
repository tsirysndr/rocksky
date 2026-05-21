import { createFileRoute } from "@tanstack/react-router";
import WrappedPage from "../pages/wrapped";

export const Route = createFileRoute("/wrapped")({
  component: WrappedPage,
});
