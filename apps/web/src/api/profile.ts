import type { t as Compatibility } from "../types/Compatibility.gen";
import type { t as Neighbour } from "../types/Neighbour.gen";
import type { t as Profile } from "../types/Profile.gen";
import type { t as Scrobble } from "../types/Scrobble.gen";
import { client } from ".";

export const getProfileByDid = async (did: string) => {
  const response = await client.get<Profile>(
    "/xrpc/app.rocksky.actor.getProfile",
    {
      params: { did },
    },
  );
  return response.data;
};

export const getProfileStatsByDid = async (did: string) => {
  const response = await client.get("/xrpc/app.rocksky.stats.getStats", {
    params: { did },
  });
  return response.data;
};

export const getGlobalStats = async () => {
  const response = await client.get<{
    scrobbles: number;
    users: number;
    artists: number;
    albums: number;
    tracks: number;
  }>("/xrpc/app.rocksky.stats.getGlobalStats");
  return response.data;
};

export const getRecentTracksByDid = async (
  did: string,
  offset = 0,
  limit = 10,
): Promise<Scrobble[]> => {
  const response = await client.get<{ scrobbles: Scrobble[] }>(
    "/xrpc/app.rocksky.actor.getActorScrobbles",
    {
      params: { did, offset, limit },
    },
  );
  return response.data.scrobbles || [];
};

export const getActorNeighbours = async (did: string) => {
  const response = await client.get<{ neighbours: Neighbour[] }>(
    "/xrpc/app.rocksky.actor.getActorNeighbours",
    {
      params: { did },
    },
  );
  return response.data;
};

export const getActorCompatibility = async (did: string) => {
  const response = await client.get<{ compatibility: Compatibility | null }>(
    "/xrpc/app.rocksky.actor.getActorCompatibility",
    {
      params: { did },
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    },
  );
  return response.data;
};
