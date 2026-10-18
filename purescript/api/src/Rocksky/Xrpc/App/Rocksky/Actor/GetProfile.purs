module Rocksky.Xrpc.App.Rocksky.Actor.GetProfile (register, getProfile, getProfileWith, resolveActor, refreshProfile) where

import Prelude
import Atproto.Api (Agent)
import Atproto.Api as Api
import Atproto.Identity as Identity
import Atproto.XrpcServer as Xrpc
import Consola as Log
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate (JSDate)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.String (Pattern(..), stripPrefix)
import Drizzle.Builder (insertForeign, leftJoin, run, runInsert, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (forkAndForget, recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.BskyProfile (ResolvedBskyProfile, fetchBskyProfile)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, readStringAt, stringify, toForeign, undefined)
import Rocksky.Lib.Plc (plcDirectoryUrl)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Schema.SpotifyTokens (SelectSpotifyToken)
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

serviceEndpoint :: Maybe String -> Aff (Maybe String)
serviceEndpoint actor = stage "Failed to get service endpoint" case actor of
  Nothing -> pure Nothing
  Just did -> case stripPrefix (Pattern "did:plc:") did, stripPrefix (Pattern "did:web:") did of
    Just _, _ -> readStringAt "service.0.serviceEndpoint" <$> (Fetch.fetch (plcDirectoryUrl <> "/" <> did) >>= Fetch.json)
    _, Just host -> readStringAt "service.0.serviceEndpoint" <$> (Fetch.fetch ("https://" <> host <> "/.well-known/did.json") >>= Fetch.json)
    _, _ -> liftEffect (Log.warn ("Unsupported DID method for " <> did <> ", skipping service endpoint resolution.")) $> Nothing

refreshProfile :: Context -> String -> String -> ResolvedBskyProfile -> Maybe SelectUser -> Aff SelectUser
refreshProfile ctx did handle fetched existing = stage "Failed to refresh profile" case existing of
  Nothing -> do
    runInsert ctx.db (insertForeign T.users [toForeign
      { did, handle, avatar: fromMaybe "" fetched.avatar, displayName: toNullable fetched.displayName }])
    rows :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)))
    user <- case head rows of
      Nothing -> throwError (error "Inserted user was not found")
      Just user -> pure user
    createdAt <- liftEffect (Date.toISOString user.createdAt)
    updatedAt <- liftEffect (Date.toISOString user.updatedAt)
    liftEffect (Nats.publishString ctx.nc "rocksky.user" (stringify (toForeign
      { xata_id: user.id, did: user.did, handle: user.handle, display_name: user.displayName, avatar: user.avatar
      , xata_createdat: createdAt, xata_updatedat: updatedAt, xata_version: 1 })))
    pure user
  Just user -> do
    let avatar = fromMaybe user.avatar fetched.avatar
        displayName = fromMaybe user.displayName (map (toNullable <<< Just) fetched.displayName)
    when (user.handle /= handle || user.avatar /= avatar || user.displayName /= displayName) do
      now <- liftEffect Date.now
      -- The source starts the update without awaiting it, then publishes.
      forkAndForget (runUpdate ctx.db (update T.users { handle, avatar, displayName, updatedAt: now }
        # where_ (SQL.eq (toSQL T.usersC.id) (SQL.string user.id))))
      createdAt <- liftEffect (Date.toISOString user.createdAt)
      updatedAt <- liftEffect (Date.now >>= Date.toISOString)
      let version = case toMaybe user.xataVersion of
            Just n | n /= 0 -> n
            _ -> 1
      liftEffect (Nats.publishString ctx.nc "rocksky.user" (stringify (toForeign
        { xata_id: user.id, did: user.did, handle, display_name: displayName, avatar
        , xata_createdat: createdAt, xata_updatedat: updatedAt, xata_version: version + 1 })))
    pure (user { handle = handle, avatar = avatar, displayName = displayName })

dated :: forall r. Maybe { createdAt :: JSDate, updatedAt :: JSDate | r } -> Effect Foreign
dated Nothing = pure (toForeign {})
dated (Just row) = do
  createdAt <- Date.toISOString row.createdAt
  updatedAt <- Date.toISOString row.updatedAt
  pure (mergeForeign (toForeign row) (toForeign { createdAt, updatedAt }))

getProfile :: Context -> Maybe String -> Maybe String -> Aff Foreign
getProfile ctx actor viewer = getProfileWith ctx actor viewer fetchBskyProfile

getProfileWith :: Context -> Maybe String -> Maybe String -> (Maybe String -> Maybe Agent -> Aff ResolvedBskyProfile) -> Aff Foreign
getProfileWith ctx actor viewer fetchProfile = do
  resolved <- resolveActor ctx actor viewer
  endpoint <- serviceEndpoint resolved.explicit
  agent <- stage "Failed to create agent" do
    result <- attempt case nonempty endpoint of
      Just url -> Just <$> liftEffect (Api.newAtpAgent url)
      Nothing -> createAgent ctx resolved.did
    case result of
      Right agent -> pure agent
      Left e -> liftEffect (Log.error ("Failed to create agent: " <> describeError e)) $> Nothing
  user <- stage "Failed to retrieve current user" do
    liftEffect (Log.info (">> did " <> resolved.did))
    rows :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string resolved.did)))
    pure (head rows)
  details <- stage "Failed to retrieve profile" do
    fetched <- fetchProfile (Just resolved.did) agent
    linked <- sequential $ { handle: _, spotify: _, token: _ }
      <$> parallel (ctx.resolver.resolveDidToHandle resolved.did)
      <*> parallel (run ctx.db
        (selectFieldsFrom { account: tableSQL T.spotifyAccounts } T.spotifyAccounts
          # leftJoin T.users (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.usersC.id))
          # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string resolved.did))) :: Aff (Array { account :: SelectSpotifyAccount }))
      <*> parallel (run ctx.db
        (selectFieldsFrom { account: tableSQL T.spotifyTokens } T.spotifyTokens
          # leftJoin T.users (SQL.eq (toSQL T.spotifyTokensC.userId) (toSQL T.usersC.id))
          # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string resolved.did))) :: Aff (Array { account :: SelectSpotifyToken }))

    pure { fetched, linked }
  refreshed <- refreshProfile ctx resolved.did details.linked.handle details.fetched user
  liftEffect do
    createdAt <- Date.toISOString refreshed.createdAt
    updatedAt <- Date.toISOString refreshed.updatedAt
    spotify <- dated (_.account <$> head details.linked.spotify)
    pure (toForeign
      { id: refreshed.id, did: resolved.did, handle: details.linked.handle, displayName: refreshed.displayName
      , avatar: if refreshed.avatar == "" then undefined else toForeign refreshed.avatar
      , createdAt, updatedAt, spotifyUser: deleteKeys ["email"] spotify
      , spotifyConnected: isJust (head details.linked.token) })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.actor.getProfile"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { did :: Nullable String }
      Xrpc.Json <$> recoverWith (toForeign {}) (timeoutMs 120000 (retryTransientDb (getProfile ctx (toMaybe params.did) (Util.authDid input))))
  }
