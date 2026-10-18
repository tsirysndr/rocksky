module Rocksky.Xrpc.App.Rocksky.Actor.GetActorCompatibility (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (filter, head, length, mapMaybe, mapWithIndex, null, sortBy, take)
import Data.Either (Either(..))
import Data.Int (toNumber)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (omitNulls, toForeign)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util
import Data.Nullable as Nullable

type RankedArtist = { artistId :: Nullable String, scrobbles :: Int }
type Artist = { id :: String, name :: String, picture :: Nullable String, uri :: Nullable String }

retrieve :: Context -> String -> Maybe String -> Aff Foreign
retrieve ctx target viewer = do
  result <- attempt do
    did <- case viewer of
      Just did | did /= "" -> pure did
      _ -> throwError (error "User not authenticated")
    users <- sequential $ { first: _, second: _ }
      <$> parallel (run ctx.readDb (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did))) :: Aff (Array { id :: String }))
      <*> parallel (run ctx.readDb (selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string target)) (SQL.eq (toSQL T.usersC.handle) (SQL.string target)))) :: Aff (Array { id :: String }))
    first <- requireUser "User1 not found" users.first
    second <- requireUser "User2 not found" users.second
    artists <- sequential $ { first: _, second: _ } <$> parallel (ranked first.id) <*> parallel (ranked second.id)
    let ids1 = mapMaybe (toMaybe <<< _.artistId) artists.first
        ids2 = mapMaybe (toMaybe <<< _.artistId) artists.second
        ranks1 = Map.fromFoldable (mapWithIndex (\i id -> Tuple id (i + 1)) ids1)
        ranks2 = Map.fromFoldable (mapWithIndex (\i id -> Tuple id (i + 1)) ids2)
        shared = filter (\id -> id /= "" && Map.member id ranks2) ids1
        union = length ids1 + length ids2 - length shared
        percent = if union > 0 then toNumber (length shared) / toNumber union * 100.0 else 0.0
        top = take 20 shared
    details :: Array Artist <- if null top then pure [] else run ctx.readDb
      (selectFieldsFrom { id: toSQL T.artistsC.id, name: toSQL T.artistsC.name, picture: toSQL T.artistsC.picture, uri: toSQL T.artistsC.uri } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string top)))
    let weighted = take 10 (sortBy (\a b -> compare b.weight a.weight) (map (\artist ->
          let user1Rank = fromMaybe 9999 (Map.lookup artist.id ranks1)
              user2Rank = fromMaybe 9999 (Map.lookup artist.id ranks2)
          in { artist, user1Rank, user2Rank, weight: 1.0 / toNumber (user1Rank + user2Rank) }) details))
    pure (toForeign
      { compatibilityLevel: min 10.0 (Number.round (percent / 10.0))
      , compatibilityPercentage: Number.round (percent * 10.0) / 10.0
      , sharedArtists: length shared, user1ArtistCount: length ids1, user2ArtistCount: length ids2
      , topSharedArtistNames: map (_.name <<< _.artist) weighted
      , topSharedDetailedArtists: map (\r -> omitNulls (toForeign
          { id: r.artist.id, name: r.artist.name, picture: r.artist.picture, uri: r.artist.uri
          , user1Rank: r.user1Rank, user2Rank: r.user2Rank, weight: r.weight })) weighted })
  case result of
    Right value -> pure value
    Left e -> throwError (error ("Failed to retrieve compatibility: " <> describeError e))
  where
  requireUser message rows = case head rows of
    Nothing -> throwError (error message)
    Just user -> pure user
  ranked id = run ctx.readDb
    (selectFieldsFrom { artistId: toSQL T.scrobblesC.artistId, scrobbles: SQL.countOf (toSQL T.scrobblesC.id) } T.scrobbles
      # innerJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
      # where_ (SQL.and (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string id)) (SQL.ne (toSQL T.artistsC.name) (SQL.string "Various Artists")))
      # groupBy [toSQL T.scrobblesC.artistId] # orderBy [SQL.desc (SQL.countOf (toSQL T.scrobblesC.id))]) :: Aff (Array RankedArtist)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.actor.getActorCompatibility"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { did :: String }
      compatibility <- recoverWith (toForeign (Nullable.null :: Nullable Foreign))
        (timeoutMs 120000 (retryTransientDb (retrieve ctx params.did (Util.authDid input))))
      pure (Util.json { compatibility })
  }
