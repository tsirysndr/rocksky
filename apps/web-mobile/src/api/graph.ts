import { rocksky } from "../lib/rocksky";

export const getFollows = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  return rocksky().get("app.rocksky.graph.getFollows", {
    actor,
    limit: limit > 0 ? limit : 1,
    dids,
    cursor,
  });
};

export const getFollowers = async (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  return rocksky().get("app.rocksky.graph.getFollowers", {
    actor,
    limit: limit > 0 ? limit : 1,
    dids,
    cursor,
  });
};

export const followAccount = async (account: string) => {
  return rocksky().followAccount(account);
};

export const unfollowAccount = async (account: string) => {
  return rocksky().unfollowAccount(account);
};
