import axios from "axios";
import { API_URL } from "../consts";
import type { RsvpStatus } from "../types/event";
import { rocksky } from "../lib/rocksky";
import type { ArtistEvent } from "../types/event";

export async function getArtistEvents(
  uri: string,
  limit: number,
  offset: number,
): Promise<ArtistEvent[]> {
  const data = (await rocksky().get("app.rocksky.artist.getArtistEvents", {
    uri,
    limit,
    offset,
    includePast: false,
  })) as { events: ArtistEvent[] };
  return data.events;
}

export async function putEventRsvp(uri: string, status: RsvpStatus) {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Sign in to RSVP.");
  const { data } = await axios.post<{ uri: string; status: RsvpStatus }>(
    `${API_URL}/xrpc/app.rocksky.event.putRsvp`,
    { uri, status },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export function rsvpRequiresSignIn(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    (error.response?.status === 401 ||
      error.response?.status === 403 ||
      error.response?.data?.error === "AuthenticationRequired")
  );
}
