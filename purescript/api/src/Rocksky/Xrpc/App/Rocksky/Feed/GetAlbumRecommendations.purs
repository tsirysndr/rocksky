module Rocksky.Xrpc.App.Rocksky.Feed.GetAlbumRecommendations where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Int as Int
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, notNull, toMaybe)
import Data.Set as Set
import Data.String as S
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, leftJoin, limit, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Xrpc.App.Rocksky.Feed.GetArtistRecommendations as Artists
import Rocksky.Xrpc.App.Rocksky.Feed.RecommendationCommon as Common
import Rocksky.Xrpc.Util as Util

type Candidate = { albumId :: String, score :: Number, source :: String }
type Retrieved = { candidates :: Array Candidate, userGenres :: Set.Set String }
type ArtistRef = { id :: String, uri :: Nullable String, name :: Nullable String }
type AlbumRef = { id :: String, artistUri :: Nullable String }
type Album = { id :: String, uri :: Nullable String, title :: String, artist :: String, artistUri :: Nullable String, year :: Nullable Int, albumArt :: Nullable String }

albumsByArtists :: Context -> Array String -> Array String -> Array String -> Aff (Array AlbumRef)
albumsByArtists ctx uris heardIds heardUris = run ctx.readDb (selectFieldsFrom { id: T.albumsC.id, artistUri: T.albumsC.artistUri } T.albums
  # where_ (fromMaybe (SQL.raw "true") (SQL.andAll
      ([SQL.inArray (toSQL T.albumsC.artistUri) (map SQL.string uris)] <>
       (if A.null heardIds then [] else [SQL.notInArray (toSQL T.albumsC.id) (map SQL.string heardIds)]) <>
       (if A.null heardUris then [] else [SQL.notInArray (toSQL T.albumsC.uri) (map SQL.string heardUris)])))) # limit 500)

retrieve :: Context -> Common.QueryParams -> Aff Retrieved
retrieve ctx params = do
  users <- run ctx.readDb (selectFieldsFrom { id: T.usersC.id } T.users
    # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string params.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string params.did)))) :: Aff (Array { id :: String })
  user <- case A.head users of
    Just value -> pure value
    Nothing -> throwError (error "User not found")
  let resultLimit = min (Int.floor (fromMaybe 50.0 (toMaybe params.limit))) 100
  heard <- sequential $ { albums: _, uris: _ }
    <$> parallel (run ctx.readDb (selectFieldsFrom { albumId: T.scrobblesC.albumId } T.scrobbles
      # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id)) # groupBy [toSQL T.scrobblesC.albumId]) :: Aff (Array { albumId :: Nullable String }))
    <*> parallel (run ctx.readDb (selectFieldsFrom { albumUri: T.tracksC.albumUri } T.scrobbles
      # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id)) # groupBy [toSQL T.tracksC.albumUri]) :: Aff (Array { albumUri :: Nullable String }))
  let heardIds = A.mapMaybe (toMaybe <<< _.albumId) heard.albums
  let heardUris = A.mapMaybe (toMaybe <<< _.albumUri) heard.uris
  userArtists <- run ctx.readDb (selectFieldsFrom { artistId: T.userArtistsC.artistId, scrobbles: T.userArtistsC.scrobbles } T.userArtists
    # where_ (SQL.eq (toSQL T.userArtistsC.userId) (SQL.string user.id)) # orderBy [SQL.desc (toSQL T.userArtistsC.scrobbles)] # limit 200) :: Aff (Array Artists.Heard)
  let heardArtistIds = map _.artistId userArtists
  let familiarity = Map.fromFoldable (map (\r -> Tuple r.artistId (fromMaybe 0.0 (toMaybe r.scrobbles))) userArtists)
  loved <- run ctx.db (selectFieldsFrom { trackId: T.lovedTracksC.trackId } T.lovedTracks
    # where_ (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id))) :: Aff (Array { trackId :: Nullable String })
  let lovedIds = A.mapMaybe (toMaybe <<< _.trackId) loved
  genreData <- sequential $ { artists: _, liked: _ }
    <$> parallel (if A.null heardArtistIds then pure [] else run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, genres: T.artistsC.genres } T.artists
      # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string heardArtistIds))) :: Aff (Array Artists.GenreArtist))
    <*> parallel (if A.null lovedIds then pure [] else do
      rows <- run ctx.readDb (selectFieldsFrom { genres: T.artistsC.genres } T.tracks
        # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
        # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string (A.take 200 lovedIds)))) :: Aff (Array { genres :: Nullable (Array String) })
      pure (A.concatMap (fromMaybe [] <<< toMaybe <<< _.genres) rows))
  let userGenres = Artists.genreProfile (map (\r -> r { scrobbles = notNull (fromMaybe 0.0 (toMaybe r.scrobbles)) }) userArtists) genreData.artists genreData.liked
  knownRows <- if A.null heardArtistIds then pure [] else run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, uri: T.artistsC.uri, name: T.artistsC.name } T.artists
    # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string heardArtistIds))) :: Aff (Array ArtistRef)
  let known = A.filter (\r -> isJust (toMaybe r.uri) && S.toLower (fromMaybe "" (toMaybe r.name)) /= "various artists") knownRows
  let knownUris = A.mapMaybe (toMaybe <<< _.uri) known
  let knownId = Map.fromFoldable (A.mapMaybe (\r -> (\uri -> Tuple uri r.id) <$> toMaybe r.uri) known)
  knownAlbums <- if A.null knownUris then pure [] else albumsByArtists ctx knownUris heardIds heardUris
  let poolA = A.mapMaybe (\r -> case toMaybe r.artistUri of
        Just uri | uri /= "" -> Just { albumId: r.id, score: fromMaybe 1.0 (Map.lookup uri knownId >>= flip Map.lookup familiarity), source: "known-artist" }
        _ -> Nothing) knownAlbums
  let sharedCount = SQL.template ["count(distinct ", ")"] [toSQL T.scrobblesC.artistId]
  neighbours <- if A.null heardArtistIds then pure [] else run ctx.readDb (selectFieldsFrom { userId: T.scrobblesC.userId, sharedCount } T.scrobbles
    # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.artistId) (map SQL.string heardArtistIds)) (SQL.ne (toSQL T.scrobblesC.userId) (SQL.string user.id)))
    # groupBy [toSQL T.scrobblesC.userId] # orderBy [SQL.desc sharedCount] # limit 50) :: Aff (Array { userId :: Nullable String, sharedCount :: Number })
  let neighbourIds = A.mapMaybe (toMaybe <<< _.userId) neighbours
  let similarities = Map.fromFoldable (A.mapMaybe (\r -> (\id -> Tuple id (r.sharedCount / Int.toNumber (A.length heardArtistIds))) <$> toMaybe r.userId) neighbours)
  poolB <- if A.null neighbourIds then pure [] else do
    let playScore = SQL.template ["sum(exp(-0.02 * extract(epoch from (now() - ", ")) / 86400))"] [toSQL T.scrobblesC.timestamp]
    newRows <- run ctx.readDb (selectFieldsFrom { artistId: T.scrobblesC.artistId, neighbourUserId: T.scrobblesC.userId, playScore } T.scrobbles
      # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.userId) (map SQL.string neighbourIds)) (SQL.notInArray (toSQL T.scrobblesC.artistId) (map SQL.string (A.take 500 heardArtistIds))))
      # groupBy [toSQL T.scrobblesC.artistId, toSQL T.scrobblesC.userId] # orderBy [SQL.desc playScore] # limit 150) :: Aff (Array { artistId :: Nullable String, neighbourUserId :: Nullable String, playScore :: Number })
    let scored = Artists.scoreCandidates (Set.fromFoldable heardArtistIds) similarities newRows
    let scores = Map.fromFoldable (map (\r -> Tuple r.artistId r.score) scored)
    if A.null scored then pure [] else do
      newArtists <- run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, uri: T.artistsC.uri, name: T.artistsC.name, genres: T.artistsC.genres } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map (SQL.string <<< _.artistId) scored))) :: Aff (Array { id :: String, uri :: Nullable String, name :: Nullable String, genres :: Nullable (Array String) })
      let allowed = A.filter (\r -> isJust (toMaybe r.uri) && S.toLower (fromMaybe "" (toMaybe r.name)) /= "various artists" &&
            (Set.isEmpty userGenres || A.any (flip Set.member userGenres) (fromMaybe [] (toMaybe r.genres)))) newArtists
      let uris = A.mapMaybe (toMaybe <<< _.uri) allowed
      let uriIds = Map.fromFoldable (A.mapMaybe (\r -> (\uri -> Tuple uri r.id) <$> toMaybe r.uri) allowed)
      if A.null uris then pure [] else do
        albums <- albumsByArtists ctx uris heardIds heardUris
        let inA = Set.fromFoldable (map _.albumId poolA)
        pure (A.mapMaybe (\r -> case toMaybe r.artistUri of
          Just uri | uri /= "" && not (Set.member r.id inA) -> Just { albumId: r.id, score: fromMaybe 0.0 (Map.lookup uri uriIds >>= flip Map.lookup scores), source: "new-artist" }
          _ -> Nothing) albums)
  let merged = A.sortBy (\a b -> compare b.score a.score) (poolA <> poolB)
  pure { candidates: A.take resultLimit (A.nubBy (\a b -> compare a.albumId b.albumId) merged), userGenres }

hydrate :: Context -> Retrieved -> Aff Foreign
hydrate ctx { candidates } = do
  let ids = map _.albumId candidates
  rows <- if A.null ids then pure [] else run ctx.readDb (selectFieldsFrom
    { id: T.albumsC.id, uri: T.albumsC.uri, title: T.albumsC.title, artist: T.albumsC.artist, artistUri: T.albumsC.artistUri, year: T.albumsC.year, albumArt: T.albumsC.albumArt } T.albums
    # where_ (SQL.inArray (toSQL T.albumsC.id) (map SQL.string ids))) :: Aff (Array Album)
  let albums = Map.fromFoldable (map (\r -> Tuple r.id r) rows)
  let scores = Map.fromFoldable (map (\r -> Tuple r.albumId r) candidates)
  let present id = do
        album <- Map.lookup id albums
        candidate <- Map.lookup id scores
        if S.toLower album.artist == "various artists" then Nothing else Just (F.omitNulls (F.toForeign
          { id: album.id, uri: album.uri, title: album.title, artist: album.artist, artistUri: album.artistUri, year: album.year, albumArt: album.albumArt, recommendationScore: candidate.score, source: candidate.source }))
  pure (F.toForeign { albums: A.mapMaybe present ids })

getAlbumRecommendations :: Context -> Common.QueryParams -> Aff Foreign
getAlbumRecommendations ctx params = retrieve ctx params >>= hydrate ctx

register :: Server -> Context -> Effect Unit
register server ctx = do
  get <- Common.cached "getAlbumRecommendations" "/v1/recommendations/albums" (F.toForeign { albums: [] :: Array Foreign }) (getAlbumRecommendations ctx)
  Xrpc.method server "app.rocksky.feed.getAlbumRecommendations" { auth: Nothing, handler: \input -> Xrpc.Json <$> get (Util.params input) }
