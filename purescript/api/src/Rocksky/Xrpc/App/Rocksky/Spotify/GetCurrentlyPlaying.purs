module Rocksky.Xrpc.App.Rocksky.Spotify.GetCurrentlyPlaying (register, retrieve) where

import Prelude
import Control.Alt ((<|>))
import Atproto.XrpcServer as Xrpc
import Data.Array (head, null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith, toLower)
import Drizzle.Builder (leftJoin, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Foreign (Foreign)
import Node.Crypto (hashHex)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

retrieve :: Context -> Maybe String -> Maybe String -> Aff Foreign
retrieve ctx actor did = do
  let target = fromMaybe "" ((actor >>= \s -> if s == "" then Nothing else Just s) <|> did)
      condition = SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string target)) (SQL.eq (toSQL T.usersC.handle) (SQL.string target))
  users :: Array SelectUser <- dbQuery ctx.pools "Failed to retrieve current user" \db -> run db (selectFrom T.users # where_ condition)
  user <- firstRow users
  accounts :: Array { account :: SelectSpotifyAccount } <- run ctx.db
    (selectFieldsFrom { account: tableSQL T.spotifyAccounts } T.spotifyAccounts
      # leftJoin T.users (SQL.eq (toSQL T.usersC.id) (toSQL T.spotifyAccountsC.userId)) # where_ condition)
  account <- firstRow accounts
  cached <- Redis.get ctx.redis (account.account.email <> ":current")
  track <- case cached of
    Nothing -> pure (F.toForeign {})
    Just value -> case F.parseJson value of
      Left e -> throwError (error e)
      Right parsed -> pure parsed
  dbQuery ctx.pools "Failed to retrieve URI and likes" \db -> do
    item <- case F.path "item" track of
      Nothing -> throwError (error "Cannot read properties of undefined (reading 'name')")
      Just value -> pure (F.unsafeFromForeign value :: { name :: String, artists :: Array { name :: String }, album :: { name :: String } })
    let sha256 = hashHex "sha256" (toLower (item.name <> " - " <> joinWith ", " (map _.name item.artists) <> " - " <> item.album.name))
    records :: Array SelectTrack <- run db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha256)))
    likes :: Array { liked :: Foreign } <- run db (selectFieldsFrom { liked: tableSQL T.lovedTracks } T.lovedTracks
      # leftJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
      # where_ (SQL.and (SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha256)) (SQL.eq (toSQL T.usersC.did) (SQL.string user.did))))
    pure (F.mergeForeign track (F.toForeign
      { songUri: fromMaybe F.undefined (F.toForeign <<< _.uri <$> head records)
      , artistUri: fromMaybe F.undefined (F.toForeign <<< _.artistUri <$> head records)
      , albumUri: fromMaybe F.undefined (F.toForeign <<< _.albumUri <$> head records)
      , liked: not (null likes) }))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.spotify.getCurrentlyPlaying"
  { auth: Just ctx.authVerifier
  , handler: \input -> Xrpc.Json <$> recoverWith (F.toForeign {})
      (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.paramString input "actor") (Util.authDid input)))) }
