import { client } from ".";

export interface ScrobbleInput {
  title: string;
  artist: string;
  albumArtist: string;
  album?: string;
  duration?: number; // milliseconds
  albumArt?: string;
  timestamp?: number; // ms since epoch
}

export const submitScrobble = async (input: ScrobbleInput): Promise<void> => {
  await client.post("/xrpc/app.rocksky.scrobble.createScrobble", input, {
    headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
  });
};
