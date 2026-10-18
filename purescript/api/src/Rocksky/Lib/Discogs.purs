-- | Client for the Discogs service (discogs/ Go service, on ctx.discogs /
-- | DISCOGS_URL). It is rate limited to Discogs' 60 requests per minute per
-- | token and caches in-process, so callers may ask freely but must treat every
-- | answer as optional.
module Rocksky.Lib.Discogs
  ( DiscogsCredit
  , DiscogsEnrichedTrack
  , DiscogsMatch
  , DiscogsEnrichResponse
  , DiscogsArtistCredit
  , DiscogsLabelRef
  , DiscogsFormat
  , DiscogsImage
  , DiscogsIdentifier
  , DiscogsTracklistEntry
  , DiscogsRelease
  , DiscogsMaster
  , DiscogsQuery
  , enrichWithDiscogs
  , getDiscogsRelease
  , getDiscogsMaster
  ) where

import Prelude

import Axios (Instance)
import Axios as Axios
import Consola as Consola
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Rocksky.Lib.Foreign (omitNulls, toForeign, unsafeFromForeign)

type DiscogsCredit =
  { artistId :: Nullable Int
  , name :: String
  , role :: Nullable String
  , tracks :: Nullable String
  }

type DiscogsEnrichedTrack =
  { title :: String
  , artist :: String
  , albumArtist :: Nullable String
  , album :: String
  , albumArt :: Nullable String
  , durationMs :: Nullable Int
  , trackNumber :: Nullable Int
  , discNumber :: Nullable Int
  , trackPosition :: Nullable String
  , releaseDate :: Nullable String
  , year :: Nullable Int
  , originalYear :: Nullable Int
  , label :: Nullable String
  , catalogNumber :: Nullable String
  , country :: Nullable String
  , barcode :: Nullable String
  , formats :: Nullable (Array String)
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  , discogsUrl :: Nullable String
  , credits :: Nullable (Array DiscogsCredit)
  , discogsReleaseId :: Nullable Int
  , discogsMasterId :: Nullable Int
  , discogsArtistId :: Nullable Int
  }

type DiscogsMatch =
  { id :: Int
  , masterId :: Nullable Int
  , type :: Nullable String
  , artist :: String
  , album :: String
  , albumArt :: Nullable String
  , year :: Nullable Int
  , country :: Nullable String
  , label :: Nullable String
  , catalogNumber :: Nullable String
  , barcode :: Nullable String
  , formats :: Nullable (Array String)
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  , url :: Nullable String
  , score :: Number
  }

type DiscogsEnrichResponse =
  { track :: Nullable DiscogsEnrichedTrack
  , matches :: Array DiscogsMatch
  }

-- The Discogs objects the service passes through on /releases/:id and
-- /masters/:id, in its own JSON shape (snake_case, as Discogs sends it).

type DiscogsArtistCredit =
  { id :: Nullable Int
  , name :: String
  , anv :: Nullable String
  , join :: Nullable String
  , role :: Nullable String
  , tracks :: Nullable String
  , resource_url :: Nullable String
  }

type DiscogsLabelRef =
  { id :: Nullable Int
  , name :: String
  , catno :: Nullable String
  , entity_type :: Nullable String
  , entity_type_name :: Nullable String
  , resource_url :: Nullable String
  }

type DiscogsFormat =
  { name :: Nullable String
  , qty :: Nullable String
  , text :: Nullable String
  , descriptions :: Nullable (Array String)
  }

type DiscogsImage =
  { type :: Nullable String
  , uri :: Nullable String
  , uri150 :: Nullable String
  , width :: Nullable Int
  , height :: Nullable Int
  }

type DiscogsIdentifier =
  { type :: String
  , value :: Nullable String
  , description :: Nullable String
  }

type DiscogsTracklistEntry =
  { position :: Nullable String
  , type_ :: Nullable String
  , title :: String
  , duration :: Nullable String
  , artists :: Nullable (Array DiscogsArtistCredit)
  , extraartists :: Nullable (Array DiscogsArtistCredit)
  }

type DiscogsRelease =
  { id :: Int
  , title :: String
  , year :: Nullable Int
  , released :: Nullable String
  , country :: Nullable String
  , notes :: Nullable String
  , uri :: Nullable String
  , master_id :: Nullable Int
  , data_quality :: Nullable String
  , artists :: Nullable (Array DiscogsArtistCredit)
  , extraartists :: Nullable (Array DiscogsArtistCredit)
  , labels :: Nullable (Array DiscogsLabelRef)
  , companies :: Nullable (Array DiscogsLabelRef)
  , formats :: Nullable (Array DiscogsFormat)
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  , tracklist :: Nullable (Array DiscogsTracklistEntry)
  , images :: Nullable (Array DiscogsImage)
  , identifiers :: Nullable (Array DiscogsIdentifier)
  }

type DiscogsMaster =
  { id :: Int
  , title :: String
  , year :: Nullable Int
  , main_release :: Nullable Int
  , uri :: Nullable String
  , artists :: Nullable (Array DiscogsArtistCredit)
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  }

type DiscogsQuery =
  { artist :: String
  , album :: Nullable String
  , title :: Nullable String
  }

-- | Ask the Discogs service for the best matching release. Never throws:
-- | `Nothing` means the service could not answer (unreachable, over quota,
-- | breaker open) and the question is still open, while a response with a null
-- | `track` means Discogs itself has no match.
enrichWithDiscogs :: forall r. { discogs :: Instance | r } -> DiscogsQuery -> Aff (Maybe DiscogsEnrichResponse)
enrichWithDiscogs ctx query = do
  let
    body = omitNulls $ toForeign
      { title: fromMaybe "" (toMaybe query.title)
      , artist: query.artist
      , album: query.album
      }
  r <- attempt (Axios.post ctx.discogs "/enrich" body)
  case r of
    Right res -> pure (Just (unsafeFromForeign (Axios.data_ res)))
    Left e -> do
      liftEffect (Consola.warnF "Discogs enrichment failed:" [ toForeign (message e) ])
      pure Nothing

-- | Fetch a full release. /enrich already deep-fetched it, so the service
-- | answers this from its own cache and it costs no Discogs quota. Never throws.
getDiscogsRelease :: forall r. { discogs :: Instance | r } -> Int -> Aff (Maybe DiscogsRelease)
getDiscogsRelease ctx id = do
  r <- attempt (Axios.get ctx.discogs ("/releases/" <> show id))
  case r of
    Right res -> pure (Just (unsafeFromForeign (Axios.data_ res)))
    Left e -> do
      liftEffect (Consola.warnF ("Discogs release " <> show id <> " fetch failed:") [ toForeign (message e) ])
      pure Nothing

-- | Fetch a master. Unlike the release this can cost a request out of the
-- | quota, so callers should ask only for masters they do not already have.
getDiscogsMaster :: forall r. { discogs :: Instance | r } -> Int -> Aff (Maybe DiscogsMaster)
getDiscogsMaster ctx id = do
  r <- attempt (Axios.get ctx.discogs ("/masters/" <> show id))
  case r of
    Right res -> pure (Just (unsafeFromForeign (Axios.data_ res)))
    Left e -> do
      liftEffect (Consola.warnF ("Discogs master " <> show id <> " fetch failed:") [ toForeign (message e) ])
      pure Nothing
