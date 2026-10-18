module Rocksky.Xrpc.App.Rocksky.Actor.GetActorLovedSongs (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Either (Either(..))
import Data.JSDate (JSDate, toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Drizzle.Builder (leftJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.Util as Util

type QueryParams = { did :: String, limit :: Nullable Int, offset :: Nullable Int }

retrieve :: Context -> QueryParams -> Aff (Array Foreign)
retrieve ctx params = do
  result <- attempt do
    rows :: Array { tracks :: SelectTrack, lovedAt :: JSDate } <- run ctx.db
      (selectFieldsFrom { tracks: tableSQL T.tracks, lovedAt: toSQL T.lovedTracksC.createdAt } T.lovedTracks
        # leftJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
        # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and
          (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string params.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string params.did)))
          (SQL.isNotNull (toSQL T.lovedTracksC.uri)))
        # limit (fromMaybe 10 (toMaybe params.limit)) # offset (fromMaybe 0 (toMaybe params.offset))
        # orderBy [SQL.desc (toSQL T.lovedTracksC.createdAt)])
    liftEffect (traverse (\row -> do
      createdAt <- toISOString row.lovedAt
      updatedAt <- toISOString row.tracks.updatedAt
      -- Preserve lyrics and every other track column, as the source does.
      pure (mergeForeign (toForeign row.tracks) (toForeign { createdAt, updatedAt }))) rows)
  case result of
    Right tracks -> pure tracks
    Left e -> throwError (error ("Failed to retrieve loved songs: " <> describeError e))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.actor.getActorLovedSongs"
  { auth: Nothing
  , handler: \input -> do
      tracks <- recoverWith [] (timeoutMs 120000 (retryTransientDb (retrieve ctx (Util.params input))))
      pure (Util.json { tracks })
  }
