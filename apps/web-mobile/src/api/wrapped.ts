import { rocksky } from "../lib/rocksky";

export interface WrappedArtist {
  id: string;
  name: string;
  picture?: string;
  uri?: string;
  playCount: number;
}

export interface WrappedTrack {
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  uri?: string;
  artistUri?: string;
  albumUri?: string;
  playCount: number;
}

export interface WrappedAlbum {
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  uri?: string;
  playCount: number;
}

export interface WrappedMilestone {
  trackTitle: string;
  artistName: string;
  timestamp: string;
  trackUri?: string;
}

export type WrappedPeriod = "year" | "3months" | "month" | "2weeks" | "week";

export const WRAPPED_PERIODS: { id: WrappedPeriod; label: string }[] = [
  { id: "year", label: "Year" },
  { id: "3months", label: "Last 3 months" },
  { id: "month", label: "Last month" },
  { id: "2weeks", label: "Last 2 weeks" },
  { id: "week", label: "Last week" },
];

export interface WrappedData {
  year: number;
  period?: WrappedPeriod;
  startDate?: string;
  endDate?: string;
  totalScrobbles: number;
  totalListeningTimeMinutes: number;
  topArtists: WrappedArtist[];
  topTracks: WrappedTrack[];
  topAlbums: WrappedAlbum[];
  topGenres: Array<{ genre: string; count: number }>;
  mostActiveDay?: { date: string; count: number };
  mostActiveHour?: number;
  newArtistsCount: number;
  firstScrobble?: WrappedMilestone;
  lastScrobble?: WrappedMilestone;
  scrobblesPerMonth: Array<{ month: number; count: number }>;
  scrobblesPerDay?: Array<{ date: string; count: number }>;
  longestStreak: number;
}

export const getWrapped = async (
  did: string,
  year: number,
  period: WrappedPeriod = "year",
): Promise<WrappedData> => {
  const data = await rocksky().wrapped(did, year, period);
  return data as unknown as WrappedData;
};
