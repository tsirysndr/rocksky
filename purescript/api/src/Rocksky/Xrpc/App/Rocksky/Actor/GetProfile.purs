module Rocksky.Xrpc.App.Rocksky.Actor.GetProfile (register, getProfile, getProfileWith, resolveActor, refreshProfile) where

import Prelude
import Atproto.Api (Agent)
import Atproto.Api as Api
import Atproto.Identity as Identity
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate (JSDate)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.String (Pattern(..), stripPrefix)
import Drizzle.Builder (leftJoin, limit, run, runUpdate, selectFieldsFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (forkAndForget, recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.BskyProfile (ResolvedBskyProfile, fetchBskyProfileWithFallback)
import Rocksky.Lib.ProfileUser as ProfileUser
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, stringify, toForeign, undefined, readStringAt)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Xrpc.Util as Util

stage :: forall a. String -> Aff a -> Aff a
stage label action = attempt action >>= case _ of
  Right value -> pure value
  Left e -> throwError (error (label <> ": " <> describeError e))

nonempty :: Maybe String -> Maybe String
nonempty (Just "") = Nothing
nonempty value = value

resolveActor :: Context -> Maybe String -> Maybe String -> Aff { did :: String, explicit :: Maybe String }
resolveActor ctx actor viewer = stage "Failed to resolve handle to DID" do
  case nonempty actor of
    Just value | not (isJust (stripPrefix (Pattern "did:plc:") value)) && not (isJust (stripPrefix (Pattern "did:web:") value)) -> do
      resolved <- Identity.resolveHandle ctx.baseIdResolver value
      case nonempty resolved of
        Nothing -> throwError (error ("handle " <> value <> " does not resolve to a DID"))
        Just did -> pure { did, explicit: Just did }
    explicit -> case explicit, nonempty viewer of
      Just did, _ -> pure { did, explicit }
      _, Just did -> pure { did, explicit }
      _, _ -> throwError (error "request carried neither an actor nor an authenticated session")

refreshProfile :: Context -> String -> String -> ResolvedBskyProfile -> Maybe SelectUser -> Aff SelectUser
refreshProfile ctx did handle fetched existing = stage "Failed to refresh profile" case existing of
  Nothing -> do
    user <- ProfileUser.save ctx.db did handle fetched
    createdAt <- liftEffect (Date.toISOString user.createdAt)
    updatedAt <- liftEffect (Date.toISOString user.updatedAt)
    liftEffect
      ( Nats.publishString ctx.nc "rocksky.user"
          ( stringify
              ( toForeign
                  { xata_id: user.id
                  , did: user.did
                  , handle: user.handle
                  , display_name: user.displayName
                  , avatar: user.avatar
                  , xata_createdat: createdAt
                  , xata_updatedat: updatedAt
                  , xata_version: 1
                  }
              )
          )
      )
    pure user
  Just user -> do
    let
      avatar = fromMaybe user.avatar fetched.avatar
      displayName = fromMaybe user.displayName (map (toNullable <<< Just) fetched.displayName)
    when (user.handle /= handle || user.avatar /= avatar || user.displayName /= displayName) do
      now <- liftEffect Date.now
      runUpdate ctx.db
        ( update T.users { handle, avatar, displayName, updatedAt: now }
            # where_ (SQL.eq (toSQL T.usersC.id) (SQL.string user.id))
        )
      createdAt <- liftEffect (Date.toISOString user.createdAt)
      updatedAt <- liftEffect (Date.now >>= Date.toISOString)
      let
        version = case toMaybe user.xataVersion of
          Just n | n /= 0 -> n
          _ -> 1
      liftEffect
        ( Nats.publishString ctx.nc "rocksky.user"
            ( stringify
                ( toForeign
                    { xata_id: user.id
                    , did: user.did
                    , handle
                    , display_name: displayName
                    , avatar
                    , xata_createdat: createdAt
                    , xata_updatedat: updatedAt
                    , xata_version: version + 1
                    }
                )
            )
        )
    pure (user { handle = handle, avatar = avatar, displayName = displayName })

dated :: forall r. Maybe { createdAt :: JSDate, updatedAt :: JSDate | r } -> Effect Foreign
dated Nothing = pure (toForeign {})
dated (Just row) = do
  createdAt <- Date.toISOString row.createdAt
  updatedAt <- Date.toISOString row.updatedAt
  pure (mergeForeign (toForeign row) (toForeign { createdAt, updatedAt }))

getProfile :: Context -> Maybe String -> Maybe String -> Aff Foreign
getProfile ctx actor viewer = getProfileWith ctx actor viewer fetchBskyProfileWithFallback

getProfileWith :: Context -> Maybe String -> Maybe String -> (Maybe String -> Aff (Maybe Agent) -> Aff ResolvedBskyProfile) -> Aff Foreign
getProfileWith ctx actor viewer fetchProfile = do
  resolved <- resolveActor ctx actor viewer
  let
    getAgent = case resolved.explicit of
      Nothing -> createAgent ctx resolved.did
      Just _ -> do
        identity <- Identity.resolveAtprotoData ctx.baseIdResolver resolved.did
        Just <$> liftEffect (Api.newAtpAgent identity.pds)
  details <- stage "Failed to retrieve profile" $ sequential $ { rows: _, handle: _, fetched: _ }
    <$> parallel
      ( run ctx.db
          ( selectFieldsFrom
              { user: tableSQL T.users, spotify: tableSQL T.spotifyAccounts, tokenId: toSQL T.spotifyTokensC.id }
              T.users
              # leftJoin T.spotifyAccounts (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.usersC.id))
              # leftJoin T.spotifyTokens (SQL.eq (toSQL T.spotifyTokensC.userId) (toSQL T.usersC.id))
              # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string resolved.did))
              # limit 1
          ) :: Aff (Array { user :: SelectUser, spotify :: Nullable SelectSpotifyAccount, tokenId :: Nullable String })
      )
    <*> parallel (ctx.resolver.resolveDidToHandle resolved.did)
    <*> parallel (fetchProfile (Just resolved.did) getAgent)
  let row = head details.rows
  refreshed <- refreshProfile ctx resolved.did details.handle details.fetched (_.user <$> row)
  liftEffect do
    createdAt <- Date.toISOString refreshed.createdAt
    updatedAt <- Date.toISOString refreshed.updatedAt
    spotify <- dated (row >>= toMaybe <<< _.spotify)
    pure
      ( toForeign
          { id: refreshed.id
          , did: resolved.did
          , handle: details.handle
          , displayName: refreshed.displayName
          , avatar: if refreshed.avatar == "" then undefined else toForeign refreshed.avatar
          , createdAt
          , updatedAt
          , spotifyUser: deleteKeys [ "email" ] spotify
          , spotifyConnected: isJust (row >>= toMaybe <<< _.tokenId)
          }
      )

savedProfile :: Context -> String -> Aff (Maybe Foreign)
savedProfile ctx actor = do
  rows :: Array { user :: SelectUser, spotify :: Nullable SelectSpotifyAccount, tokenId :: Nullable String } <- run ctx.db
    ( selectFieldsFrom { user: tableSQL T.users, spotify: tableSQL T.spotifyAccounts, tokenId: toSQL T.spotifyTokensC.id } T.users
        # leftJoin T.spotifyAccounts (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.usersC.id))
        # leftJoin T.spotifyTokens (SQL.eq (toSQL T.spotifyTokensC.userId) (toSQL T.usersC.id))
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string actor)) (SQL.eq (toSQL T.usersC.handle) (SQL.string actor)))
        # limit 1
    )
  case head rows of
    Nothing -> pure Nothing
    Just row -> liftEffect do
      createdAt <- Date.toISOString row.user.createdAt
      updatedAt <- Date.toISOString row.user.updatedAt
      spotify <- dated (toMaybe row.spotify)
      pure
        ( Just
            ( toForeign
                { id: row.user.id
                , did: row.user.did
                , handle: row.user.handle
                , displayName: row.user.displayName
                , avatar: if row.user.avatar == "" then undefined else toForeign row.user.avatar
                , createdAt
                , updatedAt
                , spotifyUser: deleteKeys [ "email" ] spotify
                , spotifyConnected: isJust (toMaybe row.tokenId)
                }
            )
        )

register :: Server -> Context -> Effect Unit
register server ctx = do
  refreshes <- queryCache (\did -> timeoutMs 30000 (getProfile ctx (Just did) Nothing)) 60000 1000
  Xrpc.method server "app.rocksky.actor.getProfile"
    { auth: Just ctx.authVerifier
    , handler: \input -> do
        let
          params = Util.params input :: { did :: Nullable String }
          viewer = Util.authDid input
          actor = case nonempty (toMaybe params.did) of
            Just value -> value
            Nothing -> fromMaybe "" viewer
        Xrpc.Json <$> recoverWith (toForeign {})
          ( timeoutMs 120000
              ( retryTransientDb do
                  saved <- savedProfile ctx actor
                  case saved of
                    Nothing -> getProfile ctx (toMaybe params.did) viewer
                    Just body -> do
                      let did = fromMaybe actor (readStringAt "did" body)
                      forkAndForget (void (refreshes did))
                      pure body
              )
          )
    }
