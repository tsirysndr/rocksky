import {
  IconBroadcast,
  IconChartBar,
  IconCloudUpload,
  IconFileImport,
  IconKey,
  IconUsersGroup,
  type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export type OnboardingStep = {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
  cta: string;
  to: string;
  accent: string;
  /** When true, `to` is an external URL opened in a new tab. */
  external?: boolean;
};

// The primary ways a new user gets their listening data into Rocksky.
// Note: Spotify is intentionally excluded — it is still limited beta.
export const GET_STARTED_STEPS: OnboardingStep[] = [
  {
    icon: IconBroadcast,
    title: "Connect a scrobbler",
    description:
      "Mirror your plays from Last.fm, ListenBrainz or teal.fm in real time.",
    cta: "Connect a service",
    to: "/mirrors",
    accent: "#ff2876",
  },
  {
    icon: IconFileImport,
    title: "Import your history",
    description: "Bring years of listens from a Last.fm or CSV/JSON export.",
    cta: "Import history",
    to: "https://docs.rocksky.app/cli/import",
    external: true,
    accent: "#00b3ff",
  },
  {
    icon: IconKey,
    title: "Scrobble from your apps",
    description: "Create an API key and scrobble from your own music player.",
    cta: "Create an API key",
    to: "/apikeys",
    accent: "#9b5cff",
  },
  {
    icon: IconCloudUpload,
    title: "Upload your own music",
    description: "Bring your own tracks and play them right here.",
    cta: "Upload music",
    to: "/library/upload",
    accent: "#1db954",
  },
];

// Secondary things to explore once there is some data.
export const EXPLORE_STEPS: OnboardingStep[] = [
  {
    icon: IconChartBar,
    title: "Discover the charts",
    description: "See what the community is listening to right now.",
    cta: "Browse charts",
    to: "/charts",
    accent: "#ffb020",
  },
  {
    icon: IconUsersGroup,
    title: "Find your people",
    description: "Follow friends and compare your music taste.",
    cta: "Explore Rocksky",
    to: "/",
    accent: "#ff6ba8",
  },
];
