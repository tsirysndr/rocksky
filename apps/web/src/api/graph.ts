import { client } from ".";

export const getFollows = async (
  actor: string,
  limit: number,
  cursor?: string,
) => {
  const response = await client.get("/xrpc/app.rocksky.graph.getFollows", {
    params: { actor, limit, cursor },
  });

  return response.data;
};

export const getKnownFollowers = async (
  actor: string,
  limit: number,
  cursor?: string,
) => {
  const response = await client.get(
    "/xrpc/app.rocksky.graph.getKnownFollowers",
    {
      params: { actor, limit, cursor },
    },
  );

  return response.data;
};

export const getFollowers = async (
  actor: string,
  limit: number,
  cursor?: string,
) => {
  const response = await client.get("/xrpc/app.rocksky.graph.getFollowers", {
    params: { actor, limit, cursor },
  });

  return response.data;
};

export const followAccount = async (account: string) => {
  const response = await client.post("/xrpc/app.rocksky.graph.followAccount", {
    params: { account },
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  return response.data;
};

export const unfollowAccount = async (account: string) => {
  const response = await client.post(
    "/xrpc/app.rocksky.graph.unfollowAccount",
    {
      params: { account },
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    },
  );

  return response.data;
};
