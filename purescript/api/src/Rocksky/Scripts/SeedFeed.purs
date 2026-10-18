module Rocksky.Scripts.SeedFeed (main, seed, seedFeeds) where

import Prelude
import Atproto.Api as Api
import Consola as Consola
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (null)
import Data.String (Pattern(..), stripPrefix)
import Data.Traversable (for_)
import Drizzle.Builder (insertForeign, onConflictDoNothing, run, runInsert, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Scripts.Common (exit, requireAgent, resolveDid, runScript, scriptArgs)

seed :: Context -> String -> Aff Unit
seed ctx identifier = do
  did <- if hasPrefix "did:plc:" identifier || hasPrefix "did:web:" identifier then pure identifier else resolveDid ctx identifier
  agent <- requireAgent ctx did
  seedFeeds ctx agent
  where
  hasPrefix prefix s = case stripPrefix (Pattern prefix) s of
    Just _ -> true
    Nothing -> false

seedFeeds :: Context -> Api.Agent -> Aff Unit
seedFeeds ctx agent = do
  repo <- liftEffect (Api.assertDid agent)
  users <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string repo))) :: Aff (Array SelectUser)
  records <- Api.listRecords agent { repo, collection: "app.rocksky.feed.generator", limit: 100, cursor: null }
  for_ records.records \feed -> when (F.readStringAt "$type" feed.value == Just "app.rocksky.feed.generator" || F.readStringAt "$type" feed.value == Just "app.rocksky.feed.generator#main") do
    user <- firstRow users
    let field k = fromMaybe F.undefined (F.path k feed.value)
    runInsert ctx.db (insertForeign T.feeds [F.toForeign { displayName: field "displayName", description: field "description", did: field "did", userId: user.id, uri: feed.uri }] # onConflictDoNothing)
    liftEffect (Consola.info ("Feed " <> fromMaybe "" (F.readStringAt "displayName" feed.value) <> " seeded successfully."))

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  case head args of
    Nothing -> do
      liftEffect do
        Consola.error "Please provide user author identifier (handle or DID)."
        Consola.info "Usage: node bin/run.js Rocksky.Scripts.SeedFeed <handle|did>"
      exit 1
    Just identifier -> seed ctx identifier *> exit 0
