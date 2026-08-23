import type {
  FollowAccountOutput,
  GetFollowersOutput,
  GetFollowsOutput,
  GetKnownFollowersOutput,
  UnfollowAccountOutput,
} from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

export const getFollows = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
): Promise<GetFollowsOutput> => {
  return (await rocksky().get("app.rocksky.graph.getFollows", {
    actor,
    limit: limit > 0 ? limit : 1,
    dids,
    cursor,
  })) as GetFollowsOutput;
};

export const getKnownFollowers = async (
  actor: string,
  limit: number,
  cursor?: string,
): Promise<GetKnownFollowersOutput> => {
  return (await rocksky().get("app.rocksky.graph.getKnownFollowers", {
    actor,
    limit: limit > 0 ? limit : 1,
    cursor,
  })) as GetKnownFollowersOutput;
};

export const getFollowers = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
): Promise<GetFollowersOutput> => {
  return (await rocksky().get("app.rocksky.graph.getFollowers", {
    actor,
    limit: limit > 0 ? limit : 1,
    dids,
    cursor,
  })) as GetFollowersOutput;
};

export const followAccount = async (
  account: string,
): Promise<FollowAccountOutput> => {
  return rocksky().followAccount(account);
};

export const unfollowAccount = async (
  account: string,
): Promise<UnfollowAccountOutput> => {
  return rocksky().unfollowAccount(account);
};
