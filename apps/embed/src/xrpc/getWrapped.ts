import { ROCKSKY_API_URL } from "../consts";

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
  playCount: number;
}

export interface WrappedData {
  year: number;
  totalScrobbles: number;
  totalListeningTimeMinutes: number;
  topArtists: WrappedArtist[];
  topTracks: WrappedTrack[];
  topGenres: Array<{ genre: string; count: number }>;
  mostActiveDay?: { date: string; count: number };
  mostActiveHour?: number;
  newArtistsCount: number;
  longestStreak: number;
}

export default async function getWrapped(handle: string, year: number) {
  const url = new URL(`${ROCKSKY_API_URL}/xrpc/app.rocksky.stats.getWrapped`);
  url.searchParams.append("did", handle);
  url.searchParams.append("year", String(year));

  const res = await fetch(url);

  if (!res.ok) {
    return { wrapped: null, ok: false };
  }

  const wrapped = (await res.json()) as WrappedData;
  return { wrapped, ok: true };
}
