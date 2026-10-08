import axios from "axios";
import { API_URL } from "../consts";
import type { RsvpStatus } from "../types/event";
import { storage } from "../storage";
import { client } from ".";
import type { ArtistEvent } from "../types/event";

export async function getArtistEvents(
  uri: string,
  limit: number,
  offset: number,
): Promise<ArtistEvent[]> {
  const { data } = await client.get<{ events: ArtistEvent[] }>(
    "/xrpc/app.rocksky.artist.getArtistEvents",
    {
      params: { uri, limit, offset, includePast: false },
      headers: storage.getToken()
        ? { Authorization: `Bearer ${storage.getToken()}` }
        : {},
    },
  );
  return data.events;
}

export async function putEventRsvp(uri: string, status: RsvpStatus) {
  const token = storage.getToken();
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
