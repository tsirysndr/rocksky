module Rocksky.Xrpc.App.Rocksky.Actor.GetActorNeighbours (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.Int (toNumber)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Database (Database, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.Foreign (toForeign, unsafeFromForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.App.Rocksky.Actor.NeighboursQuery (neighboursQuery)
import Rocksky.Xrpc.Util as Util

type SharedArtist = { id :: String, name :: String, picture :: Nullable String, uri :: Nullable String }
type NeighbourRow =
  { user_id :: String, shared_count :: Int, did :: String, handle :: String, display_name :: Nullable String
  , avatar :: Nullable String, target_artist_count :: Int, top_artists :: Array SharedArtist }

retrieve :: Database Postgres -> String -> Aff (Array Foreign)
retrieve db did = do
  users :: Array { id :: String } <- run db (selectFieldsFrom { id: toSQL T.usersC.id } T.users
    # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))))
  user <- case head users of
    Nothing -> throwError (error "User not found")
    Just user -> pure user
  rows <- map unsafeFromForeign <$> executeRows db (neighboursQuery user.id)
  pure (map (\(row :: NeighbourRow) -> toForeign
    { id: row.user_id, userId: row.user_id, did: row.did, handle: row.handle
    , displayName: fromMaybe "" (toMaybe row.display_name), avatar: fromMaybe "" (toMaybe row.avatar)
    , sharedArtistsCount: row.shared_count
    , similarityScore: if row.target_artist_count > 0 then toNumber row.shared_count / toNumber row.target_artist_count else 0.0
    , topSharedArtistNames: map _.name row.top_artists, topSharedArtistsDetails: row.top_artists }) rows)

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (\params -> timeoutMs 120000 $ retryTransientDb $
    readQuery ctx.pools "Failed to retrieve neighbours" \db -> retrieve db params.did) 600000 100
  Xrpc.method server "app.rocksky.actor.getActorNeighbours"
    { auth: Nothing
    , handler: \input -> do
        neighbours <- recoverWith [] (cached (Util.params input :: { did :: String }))
        pure (Util.json { neighbours })
    }
