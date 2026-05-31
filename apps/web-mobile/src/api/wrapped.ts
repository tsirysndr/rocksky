import { client } from "./index";

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

export interface WrappedData {
  year: number;
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
  longestStreak: number;
}

export const getWrapped = async (
  did: string,
  year: number,
): Promise<WrappedData> => {
  const res = await client.get("/xrpc/app.rocksky.stats.getWrapped", {
    params: { did, year },
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  return res.data;
};
