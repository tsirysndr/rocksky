import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";
import ProfilePage from "../../../pages/profile";

const validateSearch = z.object({
  tab: z.number().optional(),
});

export const Route = createFileRoute("/profile/$did/")({
  component: ProfilePage,
  validateSearch: zodValidator(validateSearch),
});
