module Rocksky.Spotify.App (app, currentlyPlaying) where

import Prelude
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (toMaybe)
import Data.String (joinWith, toLower)
import Drizzle.Builder (innerJoin, limit, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Hono as Hono
import Node.Crypto (hashHex)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign (mergeForeign, parseJson, toForeign, undefined, unsafeFromForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Metrics as Metrics
import Rocksky.Ratelimiter (rateLimiter)
import Rocksky.Schema as T
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Spotify.OAuth as OAuth
import Rocksky.Spotify.Playback as Playback

currentlyPlaying :: Context -> Hono.Context -> Aff Hono.Response
currentlyPlaying ctx c = do
  liftEffect (Metrics.count ctx.metrics "GET" "/spotify/currently-playing")
  viewer <- case bearerFrom (Hono.reqHeader c "authorization") of
    Nothing -> pure Nothing
    Just bearer -> toMaybe <<< _.did <$> verifyToken ctx.db bearer
  let nonempty (Just "") = Nothing
      nonempty value = value
  case nonempty (Hono.reqQuery c "did") <|> nonempty viewer of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just did -> do
      let condition = SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))
      users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ condition # limit 1)
      case head users of
        Nothing -> Rest.text c 401 "Unauthorized"
        Just user -> do
          accounts :: Array { spotifyAccount :: SelectSpotifyAccount } <- run ctx.db
            (selectFieldsFrom { spotifyAccount: tableSQL T.spotifyAccounts, user: tableSQL T.users } T.spotifyAccounts
              # innerJoin T.users (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.usersC.id)) # where_ condition # limit 1)
          case head accounts of
            Nothing -> Rest.text c 401 "Unauthorized"
            Just account -> do
              cached <- Redis.get ctx.redis (account.spotifyAccount.email <> ":current")
              case cached of
                Nothing -> Rest.json c 200 (toForeign {})
                Just "" -> Rest.json c 200 (toForeign {})
                Just text -> do
                  track <- case parseJson text of
                    Left message -> throwError (error message)
                    Right track -> pure track
                  let data_ = unsafeFromForeign track :: { item :: { name :: String, artists :: Array { name :: String }, album :: { name :: String } } }
                      sha256 = hashHex "sha256" (toLower (data_.item.name <> " - " <> joinWith ", " (map _.name data_.item.artists) <> " - " <> data_.item.album.name))
                  rows <- sequential $ { track: _, liked: _ }
                    <$> parallel (run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha256)) # limit 1) :: Aff (Array SelectTrack))
                    <*> parallel (run ctx.db
                      (selectFieldsFrom { lovedTrack: tableSQL T.lovedTracks, track: tableSQL T.tracks } T.lovedTracks
                        # innerJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
                        # where_ (SQL.and (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha256))) # limit 1) :: Aff (Array { lovedTrack :: Foreign }))
                  Rest.json c 200 (mergeForeign track (toForeign
                    { songUri: fromMaybe undefined (toForeign <<< _.uri <$> head rows.track)
                    , artistUri: fromMaybe undefined (toForeign <<< _.artistUri <$> head rows.track)
                    , albumUri: fromMaybe undefined (toForeign <<< _.albumUri <$> head rows.track)
                    , liked: isJust (head rows.liked), sha256 }))
app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.usePath a "/currently-playing" (rateLimiter ctx { limit: 10, window: 15, keyPrefix: "spotify-ratelimit" })
  OAuth.register ctx a
  Hono.get a "/currently-playing" (currentlyPlaying ctx)
  Playback.register ctx a
  pure a
