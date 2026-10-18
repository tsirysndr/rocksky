module Rocksky.Xrpc.App.Rocksky.Player.AddItemsToQueue (register, addItems) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Axios as Axios
import Control.Parallel (parSequence_)
import Data.Array (filter)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), stripPrefix)
import Drizzle.Builder (run, selectFrom)
import Drizzle.Database (transaction)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util

addItems :: Context -> Maybe String -> Array String -> Aff Unit
addItems ctx did items = case did of
  Nothing -> throwError (error "Authentication required")
  Just "" -> throwError (error "Authentication required")
  Just user -> transaction ctx.db \tx -> do
    let
      hasPrefix prefix s = case stripPrefix (Pattern prefix) s of
        Just _ -> true
        Nothing -> false
      google = filter (hasPrefix "gdrive://") items
      dropbox = filter (hasPrefix "dropbox://") items
    -- Preserve the source's whole-table IN operands and unstripped URI values.
    -- This unfinished source query may fail in PostgreSQL; the handler recovers.
    parSequence_
      [ void (run tx (selectFrom T.googleDrivePaths # where_ (SQL.inArray (tableSQL T.googleDrivePaths) (map SQL.string google))) :: Aff (Array {}))
      , void (run tx (selectFrom T.dropboxPaths # where_ (SQL.inArray (tableSQL T.dropboxPaths) (map SQL.string dropbox))) :: Aff (Array {}))
      ]
    void (Axios.post ctx.tracklist "/tracklist.addTracks" (F.toForeign { did: user, track_ids: items }))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.player.addItemsToQueue"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let items = fromMaybe [] (F.readArrayAt "items" (F.toForeign (Util.params input :: {})))
      recoverWith unit (timeoutMs 10000 (addItems ctx (Util.authDid input) (map F.unsafeFromForeign items)))
      pure Xrpc.NoContent
  }
