import { Agent, AtpAgent } from "@atproto/api";
import { OutputSchema } from "@atproto/api/dist/client/types/com/atproto/repo/getRecord";
import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ProfileViewDetailed } from "lexicon/types/app/rocksky/actor/defs";
import { QueryParams } from "lexicon/types/app/rocksky/actor/getProfile";
import { createAgent } from "lib/agent";
import _ from "lodash";
import tables from "schema";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getActorProfile = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      resolveHandleToDid,
      Effect.flatMap(withServiceEndpoint),
      Effect.flatMap(withAgent),
      Effect.flatMap(withUser),
      Effect.flatMap(retrieveProfile),
      Effect.flatMap(refreshProfile),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.actor.getProfile({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getActorProfile(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const withServiceEndpoint = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () => {
      if (params.did) {
        return fetch(`https://plc.directory/${did}`)
          .then((res) => res.json())
          .then((data) => ({
            did,
            serviceEndpoint: _.get(data, "service.0.serviceEndpoint"),
            ctx,
            params,
          }));
      }
    },
    catch: (error) => new Error(`Failed to get service endpoint: ${error}`),
  });
};

const resolveHandleToDid = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<
  { did?: string; ctx: Context; params: QueryParams },
  Error
> => {
  return Effect.tryPromise({
    try: async () => {
      if (params.did?.startsWith("did:plc:")) {
        return fetch(
          `https://dns.google/resolve?name=_atproto.${params.did}&type=TXT`
        )
          .then((res) => res.json())
          .then(
            (data) =>
              _.get(data, "Answer.0.data", "").replace(/"/g, "").split("=")[1]
          )
          .then((did) =>
            fetch(`https://plc.directory/${did}`)
              .then((res) => res.json())
              .then((data) => ({
                did,
                serviceEndpoint: _.get(data, "service.0.serviceEndpoint"),
                ctx,
                params,
              }))
          );
      }
      return {
        did: params.did || did,
        ctx,
        params,
      };
    },
    catch: (error) => new Error(`Failed to resolve handle to DID: ${error}`),
  });
};

const withUser = ({
  params,
  ctx,
  did,
  agent,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
  agent: Agent | AtpAgent;
}): Effect.Effect<
  {
    user?: SelectUser;
    ctx: Context;
    params: QueryParams;
    did?: string;
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({
          user: users[0],
          ctx,
          params,
          did,
          agent,
        })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const withAgent = ({
  params,
  ctx,
  did,
  serviceEndpoint,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
  serviceEndpoint?: string;
}): Effect.Effect<
  {
    ctx: Context;
    did?: string;
    params: QueryParams;
    agent: Agent | AtpAgent;
  },
  Error
> =>
  Effect.tryPromise({
    try: async () => ({
      ctx,
      did,
      params,
      agent: serviceEndpoint
        ? new AtpAgent({ service: serviceEndpoint })
        : await createAgent(ctx.oauthClient, did),
    }),
    catch: (error) => new Error(`Failed to create agent: ${error}`),
  });

const retrieveProfile = ({
  ctx,
  did,
  agent,
  user,
  params,
}: {
  ctx: Context;
  did?: string;
  agent: Agent | AtpAgent;
  user?: SelectUser;
  params: QueryParams;
}): Effect.Effect<[Profile, string], Error> => {
  return Effect.tryPromise({
    try: async () => {
      return Promise.all([
        agent.com.atproto.repo
          .getRecord({
            repo: did,
            collection: "app.bsky.actor.profile",
            rkey: "self",
          })
          .then(({ data }) => ({
            profileRecord: data,
            ctx,
            did,
            user,
          })),
        ctx.resolver.resolveDidToHandle(did),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve profile: ${error}`),
  });
};

const refreshProfile = ([profile, handle]: [Profile, string]) => {
  return Effect.tryPromise({
    try: async () => {
      return [profile, handle];
    },
    catch: (error) => new Error(`Failed to refresh profile: ${error}`),
  });
};

const presentation = ([profile, handle]: [Profile, string]): Effect.Effect<
  ProfileViewDetailed,
  never
> => {
  return Effect.sync(() => ({
    id: profile.user?.id,
    did: profile.did,
    handle,
    displayName: _.get(profile, "profileRecord.value.displayName"),
    avatar: `https://cdn.bsky.app/img/avatar/plain/${profile.did}/${_.get(profile, "profileRecord.value.avatar.ref", "").toString()}@jpeg`,
    createdAt: profile.user?.createdAt.toISOString(),
    updatedAt: profile.user?.updatedAt.toISOString(),
  }));
};

type Profile = {
  profileRecord: OutputSchema;
  ctx: Context;
  did: string;
  user?: SelectUser;
};
