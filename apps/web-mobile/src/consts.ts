export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8002";
export const NAVIDROME_URL =
  import.meta.env.VITE_NAVIDROME_URL || "https://navidrome.rocksky.app";

export const LAST_7_DAYS = "LAST_7_DAYS";
export const LAST_30_DAYS = "LAST_30_DAYS";
export const LAST_90_DAYS = "LAST_90_DAYS";
export const LAST_180_DAYS = "LAST_180_DAYS";
export const LAST_365_DAYS = "LAST_365_DAYS";
export const ALL_TIME = "ALL_TIME";

export const RANGE_OPTIONS = [
  { id: LAST_7_DAYS, label: "Last 7 days", days: 7 },
  { id: LAST_30_DAYS, label: "Last 30 days", days: 30 },
  { id: LAST_90_DAYS, label: "Last 90 days", days: 90 },
  { id: LAST_180_DAYS, label: "Last 180 days", days: 180 },
  { id: LAST_365_DAYS, label: "Last 365 days", days: 365 },
  { id: ALL_TIME, label: "All time", days: null },
] as const;

export const RANGE_LABELS: Record<string, string> = {
  [LAST_7_DAYS]: "Last 7 days",
  [LAST_30_DAYS]: "Last 30 days",
  [LAST_90_DAYS]: "Last 90 days",
  [LAST_180_DAYS]: "Last 180 days",
  [LAST_365_DAYS]: "Last 365 days",
  [ALL_TIME]: "All time",
};
