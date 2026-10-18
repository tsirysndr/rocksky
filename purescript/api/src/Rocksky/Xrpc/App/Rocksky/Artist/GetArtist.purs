module Rocksky.Xrpc.App.Rocksky.Artist.GetArtist (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (leftJoin, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError, logError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Xrpc.Util as Util

retrieve :: Context -> String -> Aff Foreign
retrieve ctx uri = do
  result <- attempt do
    rows :: Array { artists :: Nullable SelectArtist } <- run ctx.readDb
      (selectFieldsFrom { artists: tableSQL T.artists } T.userArtists
        # leftJoin T.artists (SQL.eq (toSQL T.userArtistsC.artistId) (toSQL T.artistsC.id))
        # where_ (SQL.or (SQL.eq (toSQL T.userArtistsC.uri) (SQL.string uri)) (SQL.eq (toSQL T.artistsC.uri) (SQL.string uri))))
    artist <- case head rows >>= toMaybe <<< _.artists of
      Nothing -> throwError (Xrpc.invalidRequestNamedError ("Artist not found: " <> uri) "NotFound")
      Just artist -> pure artist
    counts <- sequential $ { uniqueListeners: _, playCount: _ }
      <$> parallel (countRows <$> (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.userArtists # where_ (SQL.eq (toSQL T.userArtistsC.artistId) (SQL.string artist.id))) :: Aff (Array { count :: Int })))
      <*> parallel (countRows <$> (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.scrobbles # where_ (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id))) :: Aff (Array { count :: Int })))
    createdAt <- liftEffect (Date.toISOString artist.createdAt)
    updatedAt <- liftEffect (Date.toISOString artist.updatedAt)
    pure (mergeForeign (toForeign artist) (toForeign { createdAt, updatedAt, playCount: counts.playCount, uniqueListeners: counts.uniqueListeners }))
  case result of
    Right body -> pure body
    Left e | Xrpc.isInvalidRequestError e -> throwError e
    Left e -> throwError (error ("Failed to retrieve artist: " <> describeError e))
  where
  countRows = fromMaybe 0 <<< map _.count <<< head

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.artist.getArtist"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: { uri :: String }
      result <- attempt (timeoutMs 10000 (retryTransientDb (retrieve ctx params.uri)))
      case result of
        Right body -> pure (Xrpc.Json body)
        Left e | Xrpc.isInvalidRequestError e -> throwError e
        Left e -> liftEffect (logError e) $> Util.json {}
  }
