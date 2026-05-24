import { client } from ".";

export interface ScrobbleInput {
  title: string;
  artist: string;
  albumArtist: string;
  album?: string;
  duration?: number; // milliseconds
  albumArt?: string;
  timestamp?: number; // unix timestamp in seconds
  trackNumber?: number;
  copyrightMessage?: string;
  genres?: string[];
  releaseDate?: string;
  year?: number;
}

export const submitScrobble = async (input: ScrobbleInput): Promise<void> => {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v != null),
  );
  await client.post("/xrpc/app.rocksky.scrobble.createScrobble", payload, {
    headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
  });
};
