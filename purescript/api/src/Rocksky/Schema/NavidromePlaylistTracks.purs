module Rocksky.Schema.NavidromePlaylistTracks
  ( navidromePlaylistTracks
  , NavidromePlaylistTracksCols
  , SelectNavidromePlaylistTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestampTz, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.NavidromePlaylists as NavidromePlaylists
import Rocksky.Schema.Tracks as Tracks

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- Track membership for Navidrome-created playlists.

type NavidromePlaylistTracksCols =
  ( id :: Column Postgres String
  , playlistId :: Column Postgres String
  , trackId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  )

navidromePlaylistTracks :: Table Postgres NavidromePlaylistTracksCols
navidromePlaylistTracks = table "navidrome_playlist_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , playlistId: text "playlist_id" # notNull # references (columns NavidromePlaylists.navidromePlaylists).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , createdAt: timestampTz "xata_createdat" # notNull # defaultNow
  }

type SelectNavidromePlaylistTrack =
  { id :: String
  , playlistId :: String
  , trackId :: String
  , createdAt :: JSDate
  }
