module Rocksky.Scripts.Avatar (main, processUser, run) where

import Prelude
import Consola as Consola
import Data.Array as A
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Data.Traversable (for_)
import Drizzle.Builder (limit, offset, runUpdate, updateForeign)
import Drizzle.Builder as Query
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Nats as Nats
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.BskyProfile (fetchBskyProfile)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Scripts.Common (envString, exit, isoString, publishJson, runScript, scriptArgs)

processUser :: Context -> SelectUser -> Aff Unit
processUser ctx user = do
  skip <- liftEffect (envString "SKIP_AVATAR_UPDATE")
  if fromMaybe "" skip /= "" then liftEffect (Consola.info ("Skipping avatar update for " <> user.did))
  else do
    resolved <- fetchBskyProfile (Just user.did) Nothing
    if resolved.avatar == Nothing && resolved.displayName == Nothing then
      liftEffect (Consola.info ("No profile data resolved for " <> user.did <> "; leaving existing values"))
    else runUpdate ctx.db (updateForeign T.users (F.omitNulls (F.toForeign { avatar: toNullable resolved.avatar, displayName: toNullable resolved.displayName }))
      # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string user.did)))
  users <- Query.run ctx.db (Query.selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string user.did)) # limit 1) :: Aff (Array SelectUser)
  u <- firstRow users
  let payload = F.toForeign { xata_id: u.id, did: u.did, handle: u.handle, display_name: u.displayName, avatar: u.avatar
        , xata_createdat: isoString u.createdAt, xata_updatedat: isoString u.updatedAt, xata_version: u.xataVersion }
  liftEffect do
    Consola.infoF "" [payload]
    publishJson ctx "rocksky.user" payload

run :: Context -> Array String -> Aff Unit
run ctx args = do
  if A.null args then do
    liftEffect (Consola.info "Processing all users...")
    batches 0 0
  else for_ args \did -> do
    users <- Query.run ctx.db (Query.selectFrom T.users
      # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))) # limit 1) :: Aff (Array SelectUser)
    case A.head users of
      Nothing -> liftEffect (Consola.info ("User " <> did <> " not found"))
      Just user -> processUser ctx user
  Nats.flush ctx.nc
  liftEffect (Consola.info "Done")
  where
  batches at count = do
    batch <- Query.run ctx.db (Query.selectFrom T.users # limit 100 # offset at) :: Aff (Array SelectUser)
    if A.null batch then liftEffect (Consola.info ("Processed " <> show count <> " users total"))
    else do
      liftEffect (Consola.info ("Processing batch " <> show (at / 100 + 1) <> ", users " <> show (at + 1) <> "-" <> show (at + A.length batch)))
      added <- processBatch batch 0
      sleep 100
      batches (at + 100) (count + added)
  processBatch users count = case A.uncons users of
    Nothing -> pure count
    Just { head: user, tail } -> do
      result <- attempt (processUser ctx user)
      case result of
        Right _ -> processBatch tail (count + 1)
        Left e -> do
          liftEffect (Consola.errorF ("Error processing user " <> user.did <> ":") [errorToForeign e])
          processBatch tail count

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  run ctx args
  exit 0
