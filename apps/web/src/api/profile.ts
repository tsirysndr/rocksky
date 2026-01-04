import { client } from ".";
import { Compatibility } from "../types/compatibility";
import { Neighbour } from "../types/neighbour";
import { Profile } from "../types/profile";
import { Scrobble } from "../types/scrobble";

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
