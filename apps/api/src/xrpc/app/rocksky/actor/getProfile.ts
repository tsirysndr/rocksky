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
import * as R from "ramda";
import tables from "schema";
import { SelectDropboxAccounts } from "schema/dropbox-accounts";
import { SelectGoogleDriveAccounts } from "schema/google-drive-accounts";
import { SelectSpotifyAccount } from "schema/spotify-accounts";
import { SelectSpotifyToken } from "schema/spotify-tokens";
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
      if (!params.did?.startsWith("did:plc:") && !!params.did) {
        return fetch(
          `https://dns.google/resolve?name=_atproto.${params.did}&type=TXT`
        )
          .then((res) => res.json())
          .then(
            (data) =>
              _.get(data, "Answer.0.data", "").replace(/"/g, "").split("=")[1]
          )
          .then((did) => ({
            did,
            ctx,
            params,
          }));
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

const withServiceEndpoint = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<WithServiceEndpoint, Error> => {
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
      return {
        did,
        ctx,
        params,
      };
    },
    catch: (error) => new Error(`Failed to get service endpoint: ${error}`),
  });
};

const withAgent = ({
  params,
  ctx,
  did,
  serviceEndpoint,
}: WithServiceEndpoint): Effect.Effect<WithAgent, Error> =>
  Effect.tryPromise({
    try: async () => {
      return {
        ctx,
        did,
        params,
        agent: serviceEndpoint
          ? new AtpAgent({ service: serviceEndpoint })
          : await createAgent(ctx.oauthClient, did),
      };
    },
    catch: (error) => new Error(`Failed to create agent: ${error}`),
  });

const withUser = ({
  params,
  ctx,
  did,
  agent,
}: WithAgent): Effect.Effect<WithUser, Error> => {
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

const retrieveProfile = ({
  ctx,
  did,
  agent,
  user,
}: WithUser): Effect.Effect<
  [
    Profile,
    string,
    SelectSpotifyAccount,
    SelectSpotifyToken,
    SelectGoogleDriveAccounts,
    SelectDropboxAccounts,
  ],
  Error
> => {
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
        ctx.db
          .select()
          .from(tables.spotifyAccounts)
          .leftJoin(
            tables.users,
            eq(tables.spotifyAccounts.userId, tables.users.id)
          )
          .where(eq(tables.users.did, did))
          .execute()
          .then(([result]) => result.spotify_accounts),
        ctx.db
          .select()
          .from(tables.spotifyTokens)
          .leftJoin(
            tables.users,
            eq(tables.spotifyTokens.userId, tables.users.id)
          )
          .where(eq(tables.users.did, did))
          .execute()
          .then(([result]) => result?.spotify_tokens),
        ctx.db
          .select()
          .from(tables.googleDriveAccounts)
          .leftJoin(
            tables.users,
            eq(tables.googleDriveAccounts.userId, tables.users.id)
          )
          .where(eq(tables.users.did, did))
          .execute()
          .then(([result]) => result?.google_drive_accounts),
        ctx.db
          .select()
          .from(tables.dropboxAccounts)
          .leftJoin(
            tables.users,
            eq(tables.dropboxAccounts.userId, tables.users.id)
          )
          .where(eq(tables.users.did, did))
          .execute()
          .then(([result]) => result?.dropbox_accounts),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve profile: ${error}`),
  });
};

const refreshProfile = ([
  profile,
  handle,
  selectSpotifyAccount,
  selectSpotifyToken,
  selectGoogleDriveAccounts,
  selectDropboxAccounts,
]: [
  Profile,
  string,
  SelectSpotifyAccount,
  SelectSpotifyToken,
  SelectGoogleDriveAccounts,
  SelectDropboxAccounts,
]) => {
  return Effect.tryPromise({
    try: async () => {
      return [
        profile,
        handle,
        selectSpotifyAccount,
        selectSpotifyToken,
        selectGoogleDriveAccounts,
        selectDropboxAccounts,
      ];
    },
    catch: (error) => new Error(`Failed to refresh profile: ${error}`),
  });
};

const presentation = ([
  profile,
  handle,
  spotifyUser,
  spotifyToken,
  googledrive,
  dropbox,
]: [
  Profile,
  string,
  SelectSpotifyAccount,
  SelectSpotifyToken,
  SelectGoogleDriveAccounts,
  SelectDropboxAccounts,
]): Effect.Effect<ProfileViewDetailed, never> => {
  return Effect.sync(() => ({
    id: profile.user?.id,
    did: profile.did,
    handle,
    displayName: _.get(profile, "profileRecord.value.displayName"),
    avatar: `https://cdn.bsky.app/img/avatar/plain/${profile.did}/${_.get(profile, "profileRecord.value.avatar.ref", "").toString()}@jpeg`,
    createdAt: profile.user?.createdAt.toISOString(),
    updatedAt: profile.user?.updatedAt.toISOString(),
    spotifyUser,
    spotifyToken: {
      ...R.omit(["accessToken", "refreshToken"], spotifyToken),
      createdAt: spotifyToken?.createdAt.toISOString(),
      updatedAt: spotifyToken?.updatedAt.toISOString(),
    },
    spotifyConnected: !!spotifyToken,
    googledrive: {
      ...googledrive,
      createdAt: googledrive?.createdAt.toISOString(),
      updatedAt: googledrive?.updatedAt.toISOString(),
    },
    dropbox: {
      ...dropbox,
      createdAt: dropbox?.createdAt.toISOString(),
      updatedAt: dropbox?.updatedAt.toISOString(),
    },
  }));
};

type Profile = {
  profileRecord: OutputSchema;
  ctx: Context;
  did: string;
  user?: SelectUser;
};

type WithServiceEndpoint = {
  params: QueryParams;
  ctx: Context;
  did?: string;
  serviceEndpoint?: string;
};

type WithAgent = {
  ctx: Context;
  did?: string;
  params: QueryParams;
  agent: Agent | AtpAgent;
};

type WithUser = {
  user?: SelectUser;
  ctx: Context;
  params: QueryParams;
  did?: string;
  agent: Agent | AtpAgent;
};
