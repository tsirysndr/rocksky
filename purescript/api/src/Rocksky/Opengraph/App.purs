module Rocksky.Opengraph.App (app) where

import Prelude
import Data.Array (head, index)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), split, stripSuffix)
import Drizzle.Builder (leftJoin, limit, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Foreign (Foreign)
import Hono as Hono
import JSURI (decodeURIComponent)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (toForeign, undefined)
import Rocksky.Lib.Matching (matches)
import Rocksky.Lib.Rest as Rest
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)

decode :: String -> Aff String
decode value = case decodeURIComponent value of
  Just text -> pure text
  Nothing -> throwError (error "URI malformed")

view :: Hono.Context -> String -> String -> Foreign -> String -> Aff Hono.Response
view c title description image url = Rest.json c 200 (toForeign { title, description, image, url, type: "website", twitterCard: "summary_large_image" })

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/" \c -> case Hono.reqQuery c "path" of
    Nothing -> Rest.text c 400 "OG Service: please provide a path query parameter."
    Just "" -> Rest.text c 400 "OG Service: please provide a path query parameter."
    Just path -> do
      let parts = split (Pattern "/") path
      if matches "^/profile/([^/]+)$" path then do
        handle <- decode (fromMaybe "" (index parts 2))
        rows :: Array SelectUser <- run ctx.readDb (selectFrom T.users
          # where_ (SQL.or (SQL.eq (toSQL T.usersC.handle) (SQL.string handle)) (SQL.eq (toSQL T.usersC.did) (SQL.string handle))) # limit 1)
        case head rows of
          Nothing -> Rest.text c 404 "OG Service: user not found."
          Just user -> view c ("@" <> user.handle <> " on Rocksky")
            "Rocksky user profile — recent scrobbles, top artists, albums, and tracks."
            (case stripSuffix (Pattern "/@jpeg") user.avatar of
              Just _ -> undefined
              Nothing -> toForeign user.avatar)
            ("https://rocksky.app/profile/" <> user.handle)
      else if matches "^/(did:plc:[^/]+)/(scrobble|album|artist|song)/([^/]+)$" path then do
        did <- decode (fromMaybe "" (index parts 1))
        rkey <- decode (fromMaybe "" (index parts 3))
        let kind = fromMaybe "" (index parts 2)
        let uri = "at://" <> did <> "/app.rocksky." <> kind <> "/" <> rkey
        let url = "https://rocksky.app/" <> did <> "/" <> kind <> "/" <> rkey
        case kind of
          "scrobble" -> do
            rows :: Array { users :: SelectUser, tracks :: SelectTrack, artists :: SelectArtist, albums :: SelectAlbum } <- run ctx.readDb
              (selectFieldsFrom { users: tableSQL T.users, tracks: tableSQL T.tracks, artists: tableSQL T.artists, albums: tableSQL T.albums } T.scrobbles
                # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri))
                # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
                # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
                # leftJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
                # leftJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id)) # limit 1)
            case head rows of
              Nothing -> notFound c
              Just row -> view c ("Scrobble: " <> row.tracks.title <> " by " <> row.artists.name)
                ("A listening activity (scrobble) - " <> row.tracks.title <> " - " <> row.artists.name <> " by @" <> row.users.handle <> " on Rocksky.")
                (toForeign row.albums.albumArt) url
          "album" -> do
            rows :: Array SelectAlbum <- run ctx.readDb (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string uri)) # limit 1)
            case head rows of
              Nothing -> notFound c
              Just row -> view c ("Album: " <> row.title <> " by " <> row.artist) (description (row.title <> " by " <> row.artist)) (toForeign row.albumArt) url
          "artist" -> do
            rows :: Array SelectArtist <- run ctx.readDb (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string uri)) # limit 1)
            case head rows of
              Nothing -> notFound c
              Just row -> view c ("Artist: " <> row.name) (description row.name) (toForeign row.picture) url
          _ -> do
            rows :: Array SelectTrack <- run ctx.readDb (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string uri)) # limit 1)
            case head rows of
              Nothing -> notFound c
              Just row -> view c ("Track: " <> row.title <> " by " <> row.artist) (description (row.title <> " by " <> row.artist)) (toForeign row.albumArt) url
      else Rest.text c 400 "OG Service: unsupported path format."
  pure a
  where
  notFound c = Rest.text c 404 "OG Service: record not found."
  description name = "See listening stats and favorites for " <> name <> " on Rocksky."
