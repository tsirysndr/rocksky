module Rocksky.Users.Profile (register, registerWith, Operations) where

import Prelude
import Atproto.Api (Agent)
import Data.Array as A
import Data.Maybe (Maybe(..))
import Data.Nullable (toNullable)
import Drizzle.Builder (limit, run, runUpdate, selectFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Hono as Hono
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.BskyProfile (ResolvedBskyProfile, fetchBskyProfile)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Users.Common as Common

type Operations = { agent :: String -> Aff (Maybe Agent), handle :: String -> Aff String, profile :: String -> Agent -> Aff ResolvedBskyProfile, publish :: Foreign -> Effect Unit }

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx
  { agent: createAgent ctx, handle: ctx.resolver.resolveDidToHandle
  , profile: \did agent -> fetchBskyProfile (Just did) (Just agent)
  , publish: \user -> Nats.publishString ctx.nc "rocksky.user" (F.stringify user) }

registerWith :: Context -> Operations -> Hono.App -> Effect Unit
registerWith ctx ops app = Common.get ctx app "/:did" \c -> do
  let did = Hono.reqParam c "did"
  case bearerFrom (Hono.reqHeader c "authorization") of
    Nothing -> pure unit
    Just bearer -> do
      claims <- verifyToken ctx.db bearer
      agent <- ops.agent (F.stringValue (F.toForeign claims.did))
      case agent of
        Nothing -> pure unit
        Just a -> do
          handle <- ops.handle did
          profile <- ops.profile did a
          when (handle /= "") do
            let patch = F.mergeForeign (F.toForeign { handle }) (F.omitNulls (F.toForeign
                  { displayName: toNullable profile.displayName
                  , avatar: toNullable profile.avatar }))
            runUpdate ctx.db (updateForeign T.users patch # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)))
            rows <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1) :: Aff (Array {})
            liftEffect (ops.publish (case A.head rows of
              Just value -> F.toForeign value
              Nothing -> F.undefined))
  users <- run ctx.db (selectFrom T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))) # limit 1) :: Aff (Array {})
  case A.head users of
    Nothing -> Rest.text c 404 "User not found"
    Just user -> Rest.json c 200 (F.toForeign user)
