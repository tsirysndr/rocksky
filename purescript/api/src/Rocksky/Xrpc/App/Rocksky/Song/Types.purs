-- | Spotify search and Deezer enrichment response shapes (`song/types.ts`).
-- | Optional fields are `Nullable`.
module Rocksky.Xrpc.App.Rocksky.Song.Types
  ( SearchResponse
  , Tracks
  , Track
  , Album
  , Copyright
  , Artist
  , ExternalUrls
  , ExternalIds
  , Image
  , AccessToken
  , MusicBrainzArtist
  , DeezerEnrichedTrack
  , DeezerMatch
  , DeezerEnrichResponse
  ) where

import Data.Nullable (Nullable)

type SearchResponse = { tracks :: Tracks }

type Tracks =
  { href :: String
  , limit :: Int
  , next :: Nullable String
  , offset :: Int
  , previous :: Nullable String
  , total :: Int
  , items :: Array Track
  }

type Track =
  { album :: Album
  , artists :: Array Artist
  , available_markets :: Array String
  , disc_number :: Int
  , duration_ms :: Number
  , explicit :: Boolean
  , external_ids :: ExternalIds
  , external_urls :: ExternalUrls
  , href :: String
  , id :: String
  , is_local :: Boolean
  , is_playable :: Nullable Boolean
  , name :: String
  , popularity :: Int
  , preview_url :: Nullable String
  , track_number :: Int
  , type :: String
  , uri :: String
  }

type Album =
  { album_type :: String
  , artists :: Array Artist
  , available_markets :: Array String
  , external_urls :: ExternalUrls
  , href :: String
  , id :: String
  , images :: Array Image
  , name :: String
  , release_date :: String
  , release_date_precision :: String
  , total_tracks :: Int
  , type :: String
  , uri :: String
  , label :: Nullable String
  , genres :: Nullable (Array String)
  , copyrights :: Nullable (Array Copyright)
  }

type Copyright = { text :: String, type :: String }

type Artist =
  { external_urls :: ExternalUrls
  , href :: String
  , id :: String
  , name :: String
  , type :: String
  , uri :: String
  , images :: Nullable (Array Image)
  , genres :: Nullable (Array String)
  }

type ExternalUrls = { spotify :: String }

type ExternalIds = { isrc :: String }

type Image = { height :: Int, width :: Int, url :: String }

type AccessToken =
  { access_token :: String
  , token_type :: String
  , scope :: String
  , expires_in :: Int
  }

type MusicBrainzArtist = { mbid :: String, name :: String }

-- | Mirrors the response of the Deezer enrichment service (deezer/ Go service,
-- | POST /enrich). Durations are already normalized to milliseconds.
type DeezerEnrichedTrack =
  { title :: String
  , artist :: String
  , albumArtist :: Nullable String
  , album :: String
  , albumArt :: Nullable String
  , isrc :: Nullable String
  , upc :: Nullable String
  , durationMs :: Number
  , trackNumber :: Nullable Int
  , discNumber :: Nullable Int
  , releaseDate :: Nullable String
  , year :: Nullable Int
  , label :: Nullable String
  , genres :: Nullable (Array String)
  , artistPicture :: Nullable String
  , deezerLink :: Nullable String
  , preview :: Nullable String
  , explicit :: Nullable Boolean
  , deezerTrackId :: Nullable Number
  , deezerAlbumId :: Nullable Number
  , deezerArtistId :: Nullable Number
  }

type DeezerMatch =
  { id :: Number
  , title :: String
  , artist :: String
  , album :: String
  , albumArt :: Nullable String
  , isrc :: Nullable String
  , durationMs :: Number
  , link :: Nullable String
  , preview :: Nullable String
  , rank :: Nullable Number
  , explicit :: Nullable Boolean
  , score :: Number
  }

type DeezerEnrichResponse =
  { track :: Nullable DeezerEnrichedTrack
  , matches :: Array DeezerMatch
  }
