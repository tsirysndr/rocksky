module Rocksky.Xrpc.App.Rocksky.Charts.GetTopArtists (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Xrpc.App.Rocksky.Charts.Common as Common
import Rocksky.Xrpc.Util as Util

retrieve :: Context -> Common.QueryParams -> Aff (Array Foreign)
retrieve ctx params = readQuery ctx.pools "Failed to retrieve top artists" \db -> do
  ranked <- Common.ranking db true params
  if A.null ranked then pure [] else do
    let ids = A.mapMaybe (toMaybe <<< _.id) ranked
    artists :: Array SelectArtist <- run db (selectFieldsFrom
      { id: toSQL T.artistsC.id, name: toSQL T.artistsC.name, picture: toSQL T.artistsC.picture
      , sha256: toSQL T.artistsC.sha256, uri: toSQL T.artistsC.uri, genres: toSQL T.artistsC.genres } T.artists
      # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string ids)))
    let byId = Map.fromFoldable (map (\artist -> Tuple artist.id artist) artists)
    pure (A.mapMaybe (\rank -> do
      artist <- toMaybe rank.id >>= flip Map.lookup byId
      pure (toForeign { id: artist.id, name: artist.name, picture: artist.picture, sha256: artist.sha256, uri: artist.uri
        , playCount: Common.number rank.scrobbles, uniqueListeners: Common.number rank.uniqueListeners, tags: fromMaybe [] (toMaybe artist.genres) })) ranked)

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (timeoutMs 120000 <<< retryTransientDb <<< retrieve ctx) 120000 1000
  Xrpc.method server "app.rocksky.charts.getTopArtists"
    { auth: Nothing, handler: \input -> do
        artists <- recoverWith [] (cached (Util.params input))
        pure (Util.json { artists }) }
