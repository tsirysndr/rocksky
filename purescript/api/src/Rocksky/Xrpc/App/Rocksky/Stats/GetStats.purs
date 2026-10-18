-- | app.rocksky.stats.getStats
module Rocksky.Xrpc.App.Rocksky.Stats.GetStats (register, QueryParams) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Consola as Consola
import Control.Parallel (parSequence)
import Data.Array (head)
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.StatsCache (CachedStats, readStats, writeStats)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { did :: String }

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.stats.getStats"
    { auth: Nothing
    , handler: \input -> do
        let p = params input :: QueryParams
        -- Deliberately no fallback. Returning zeros here is indistinguishable
        -- from a genuinely empty profile, and both web clients read zero
        -- scrobbles on your own profile as "new user" and show the onboarding
        -- flow. Failing lets the client keep its last good value instead of
        -- telling an established listener they have never scrobbled.
        r <- attempt (timeoutMs 120000 (retryTransientDb (presentation <$> retrieve ctx p)))
        case r of
          Right body -> pure (Json (toForeign body))
          Left err -> do
            liftEffect (Consola.errorF "Failed to retrieve stats:" [ errorToForeign err ])
            throwError err
    }

emptyStats :: CachedStats
emptyStats = { scrobbles: 0, artists: 0, loved_tracks: 0, albums: 0, tracks: 0 }

retrieve :: Context -> QueryParams -> Aff CachedStats
retrieve ctx p = do
  cached <- readStats ctx p.did
  case cached of
    Just data_ -> pure data_
    Nothing -> do
      -- Identity, not an aggregate: read it from the primary. On the replica a
      -- just-created account has not replicated yet, and "user not found" here
      -- returns zeros — which the clients render as the onboarding flow.
      users :: Array { id :: String } <- run ctx.db
        ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
            # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string p.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string p.did)))
        )
      case head users of
        Nothing -> pure emptyStats
        Just user -> do
          -- One pass, not four. Every count here scans the same slice of
          -- `scrobbles`, and issuing them as separate queries meant four pool slots
          -- and four multi-second index scans per profile card — which is what
          -- exhausted the pool and left these queries to be cancelled by the
          -- replica's recovery conflicts.
          rs <- parSequence
            [ Left <$>
                ( run ctx.readDb
                    ( selectFieldsFrom
                        { scrobbles: SQL.count
                        , artists: distinct (toSQL T.scrobblesC.artistId)
                        , albums: distinct (toSQL T.scrobblesC.albumId)
                        , tracks: distinct (toSQL T.scrobblesC.trackId)
                        }
                        T.scrobbles
                        # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id))
                    ) :: Aff (Array CountsRow)
                )
            , Right <$>
                ( run ctx.db
                    ( selectFieldsFrom { n: SQL.count } T.lovedTracks
                        # where_ (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id))
                    ) :: Aff (Array { n :: Int })
                )
            ]
          let
            counts = case rs of
              [ Left c, _ ] -> head c
              _ -> Nothing
            loved = case rs of
              [ _, Right l ] -> fromMaybe 0 (_.n <$> head l)
              _ -> 0
            data_ =
              { scrobbles: fromMaybe 0 (_.scrobbles <$> counts)
              , artists: fromMaybe 0 (counts >>= num <<< _.artists)
              , loved_tracks: loved
              , albums: fromMaybe 0 (counts >>= num <<< _.albums)
              , tracks: fromMaybe 0 (counts >>= num <<< _.tracks)
              }
          writeStats ctx p.did data_
          pure data_
  where
  distinct col = SQL.template [ "count(distinct ", ")" ] [ col ]
  num = toMaybe >=> fromString

-- | `count(distinct ...)` through a bare `sql` template comes back as a string.
type CountsRow = { scrobbles :: Int, artists :: Nullable String, albums :: Nullable String, tracks :: Nullable String }

presentation :: CachedStats -> { scrobbles :: Int, artists :: Int, lovedTracks :: Int, albums :: Int, tracks :: Int }
presentation d = { scrobbles: d.scrobbles, artists: d.artists, lovedTracks: d.loved_tracks, albums: d.albums, tracks: d.tracks }
