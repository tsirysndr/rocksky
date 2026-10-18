module Rocksky.Schema.Tracks
  ( tracks
  , TracksCols
  , SelectTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, real, timestamp, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type TracksCols =
  ( id :: Column Postgres String
  , title :: Column Postgres String
  , artist :: Column Postgres String
  , albumArtist :: Column Postgres String
  , albumArt :: Column Postgres (Nullable String)
  , album :: Column Postgres String
  , trackNumber :: Column Postgres (Nullable Int)
  , duration :: Column Postgres Int
  , mbId :: Column Postgres (Nullable String)
  , isrc :: Column Postgres (Nullable String)
  , youtubeLink :: Column Postgres (Nullable String)
  , spotifyLink :: Column Postgres (Nullable String)
  , appleMusicLink :: Column Postgres (Nullable String)
  , tidalLink :: Column Postgres (Nullable String)
  , sha256 :: Column Postgres String
  , discNumber :: Column Postgres (Nullable Int)
  , lyrics :: Column Postgres (Nullable String)
  , composer :: Column Postgres (Nullable String)
  , genre :: Column Postgres (Nullable String)
  , label :: Column Postgres (Nullable String)
  , copyrightMessage :: Column Postgres (Nullable String)
  , key :: Column Postgres (Nullable String)
  , bpm :: Column Postgres (Nullable Number)
  , acoustidFingerprint :: Column Postgres (Nullable String)
  , uri :: Column Postgres (Nullable String)
  , albumUri :: Column Postgres (Nullable String)
  , artistUri :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

tracks :: Table Postgres TracksCols
tracks = table "tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , title: text "title" # notNull
  , artist: text "artist" # notNull
  , albumArtist: text "album_artist" # notNull
  , albumArt: text "album_art"
  , album: text "album" # notNull
  , trackNumber: integer "track_number"
  , duration: integer "duration" # notNull
  , mbId: text "mb_id"
  , isrc: text "isrc"
  , youtubeLink: text "youtube_link" # unique
  , spotifyLink: text "spotify_link" # unique
  , appleMusicLink: text "apple_music_link" # unique
  , tidalLink: text "tidal_link" # unique
  , sha256: text "sha256" # notNull # unique
  , discNumber: integer "disc_number"
  , lyrics: text "lyrics"
  , composer: text "composer"
  , genre: text "genre"
  , label: text "label"
  , copyrightMessage: text "copyright_message"
  , key: text "key"
  , bpm: real "bpm"
  , acoustidFingerprint: text "acoustid_fingerprint"
  , uri: text "uri" # unique
  , albumUri: text "album_uri"
  , artistUri: text "artist_uri"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectTrack =
  { id :: String
  , title :: String
  , artist :: String
  , albumArtist :: String
  , albumArt :: Nullable String
  , album :: String
  , trackNumber :: Nullable Int
  , duration :: Int
  , mbId :: Nullable String
  , isrc :: Nullable String
  , youtubeLink :: Nullable String
  , spotifyLink :: Nullable String
  , appleMusicLink :: Nullable String
  , tidalLink :: Nullable String
  , sha256 :: String
  , discNumber :: Nullable Int
  , lyrics :: Nullable String
  , composer :: Nullable String
  , genre :: Nullable String
  , label :: Nullable String
  , copyrightMessage :: Nullable String
  , key :: Nullable String
  , bpm :: Nullable Number
  , acoustidFingerprint :: Nullable String
  , uri :: Nullable String
  , albumUri :: Nullable String
  , artistUri :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
