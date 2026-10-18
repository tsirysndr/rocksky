module Rocksky.Scripts.Dedup (main, deduplicate) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Data.Array as A
import Data.Foldable (foldM)
import Data.Maybe (Maybe(..))
import Data.Nullable (null, toMaybe)
import Data.String (Pattern(..), stripPrefix)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, requireAgent, resolveDid, rkeyOf, runScript, scriptArgs)

deduplicate :: Context -> Api.Agent -> Aff Unit -> Aff Unit
deduplicate ctx agent pause = do
  repo <- liftEffect (Api.assertDid agent)
  let
    page counter = do
      -- The original script checks the returned cursor but does not send it
      -- into listRecords. Preserve that source limitation explicitly.
      records <- Api.listRecords agent { repo, collection: "app.rocksky.scrobble", limit: 100, cursor: null }
      next <- foldM (\i record -> do
        found <- run ctx.db (selectFrom T.scrobbles # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string record.uri)) # limit 1) :: Aff (Array {})
        if A.null found then do
          liftEffect (Log.infoF (show i <> " Deleting record:") [toForeign record])
          Api.deleteRecord agent { repo, collection: "app.rocksky.scrobble", rkey: rkeyOf record.uri }
          pause
        else liftEffect (Log.infoF (show i <> " Keeping record:") [toForeign record])
        pure (i + 1)) counter records.records
      case toMaybe records.cursor of
        Just cursor | cursor /= "" -> page next
        _ -> pure unit
  page 1
  liftEffect (Log.info "Deduplication complete.")

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  identifier <- case A.head args of
    Just value -> pure value
    Nothing -> do
      liftEffect do
        Log.error "Please provide user author identifier (handle or DID)."
        Log.info "Usage: node bin/run.js Rocksky.Scripts.Dedup <handle|did>"
      exit 1
  let hasPrefix prefix = case stripPrefix (Pattern prefix) identifier of
        Just _ -> true
        Nothing -> false
  did <- if hasPrefix "did:plc:" || hasPrefix "did:web:" then pure identifier else resolveDid ctx identifier
  agent <- requireAgent ctx did
  deduplicate ctx agent (sleep 1000)
  exit 0
