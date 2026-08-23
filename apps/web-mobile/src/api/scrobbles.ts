import { rocksky } from "../lib/rocksky";

export interface ScrobbleInput {
  title: string;
  artist: string;
  albumArtist: string;
  album?: string;
  duration?: number; // milliseconds
  albumArt?: string;
  timestamp?: number; // unix timestamp in seconds
}

export const submitScrobble = async (input: ScrobbleInput): Promise<void> => {
  await rocksky().createScrobble(input);
};
