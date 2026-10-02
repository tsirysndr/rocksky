import { client } from ".";
import { storage } from "../storage";

export type GraphUser = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type FollowsResponse = {
  follows: GraphUser[];
  cursor?: string;
  count?: number;
};

export type FollowersResponse = {
  followers: GraphUser[];
  cursor?: string;
  count?: number;
};

export const getFollows = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
): Promise<FollowsResponse> => {
  const response = await client.get<FollowsResponse>(
    "/xrpc/app.rocksky.graph.getFollows",
    {
      params: { actor, limit: limit > 0 ? limit : 1, dids, cursor },
    },
  );
  return response.data;
};

export const getKnownFollowers = async (
  actor: string,
  limit: number,
  cursor?: string,
): Promise<FollowersResponse> => {
  const response = await client.get<FollowersResponse>(
    "/xrpc/app.rocksky.graph.getKnownFollowers",
    { params: { actor, limit: limit > 0 ? limit : 1, cursor } },
  );
  return response.data;
};

export const getFollowers = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
): Promise<FollowersResponse> => {
  const response = await client.get<FollowersResponse>(
    "/xrpc/app.rocksky.graph.getFollowers",
    {
      params: { actor, limit: limit > 0 ? limit : 1, dids, cursor },
    },
  );
  return response.data;
};

export const followAccount = async (account: string) => {
  const response = await client.post(
    "/xrpc/app.rocksky.graph.followAccount",
    undefined,
    {
      params: { account },
      headers: { Authorization: `Bearer ${storage.getToken()}` },
    },
  );
  return response.data;
};

export const unfollowAccount = async (account: string) => {
  const response = await client.post(
    "/xrpc/app.rocksky.graph.unfollowAccount",
    undefined,
    {
      params: { account },
      headers: { Authorization: `Bearer ${storage.getToken()}` },
    },
  );
  return response.data;
};
