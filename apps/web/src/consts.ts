export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8002";

export const AUDIO_EXTENSIONS = [
  "mp3",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "mp4",
  "alac",
  "wav",
  "wv",
  "mpc",
  "aiff",
  "aif",
  "ac3",
  "opus",
  "wma",
];

export const LAST_7_DAYS = "LAST_7_DAYS";
export const LAST_30_DAYS = "LAST_30_DAYS";
export const LAST_90_DAYS = "LAST_90_DAYS";
export const LAST_180_DAYS = "LAST_180_DAYS";
export const LAST_365_DAYS = "LAST_365_DAYS";
export const ALL_TIME = "ALL_TIME";

export const LAST_DAYS_LABELS: Record<string, string> = {
  [LAST_7_DAYS]: "Last 7 days",
  [LAST_30_DAYS]: "Last 30 days",
  [LAST_90_DAYS]: "Last 90 days",
  [LAST_180_DAYS]: "Last 180 days",
  [LAST_365_DAYS]: "Last 365 days",
  [ALL_TIME]: "All Time",
};
