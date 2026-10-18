module Rocksky.Xrpc.App.Rocksky.Feed.GetRecommendations where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Foldable (foldl)
import Data.Int as Int
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
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

type Candidate = { trackId :: String, score :: Number, source :: String }
type Retrieved = { candidates :: Array Candidate, userGenres :: Set.Set String }
type Loved = { trackId :: String, userId :: String }
type Track = { id :: String, title :: Nullable String, artist :: Nullable String, album :: Nullable String, albumArt :: Nullable String, trackUri :: Nullable String, artistUri :: Nullable String, albumUri :: Nullable String, genres :: Nullable (Array String) }

scoreCandidates :: Set.Set String -> Map.Map String Number -> Array Loved -> Array { trackId :: Nullable String, neighbourUserId :: Nullable String, playScore :: Number } -> Array Candidate
scoreCandidates excluded similarities loved rows = foldl addLoved (foldl add [] rows) loved
  where
  lovedSet = Set.fromFoldable (map (\r -> r.userId <> ":" <> r.trackId) loved)
  add acc row = case toMaybe row.trackId, toMaybe row.neighbourUserId of
    Just id, Just neighbour | id /= "" && neighbour /= "" && not (Set.member id excluded) ->
      let isLoved = Set.member (neighbour <> ":" <> id) lovedSet
          score = fromMaybe 0.0 (Map.lookup neighbour similarities) * row.playScore * (if isLoved then 5.0 else 1.0)
          candidate = { trackId: id, score, source: if isLoved then "social" else "neighbour" }
      in case A.findIndex (\r -> r.trackId == id) acc of
        Nothing | score > 0.0 -> A.snoc acc candidate
        Just index -> fromMaybe acc (A.modifyAt index (\r -> if score > r.score then candidate else r) acc)
        _ -> acc
    _, _ -> acc
  addLoved acc row = if Set.member row.trackId excluded || A.any (\r -> r.trackId == row.trackId) acc then acc
    else A.snoc acc { trackId: row.trackId, score: fromMaybe 0.0 (Map.lookup row.userId similarities) * 5.0, source: "social" }

retrieve :: Context -> Common.QueryParams -> Aff Retrieved
retrieve ctx params = do
  users <- run ctx.readDb (selectFieldsFrom { id: T.usersC.id } T.users
    # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string params.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string params.did)))) :: Aff (Array { id :: String })
  user <- case A.head users of
    Just value -> pure value
    Nothing -> throwError (error "User not found")
  let resultLimit = min (Int.floor (fromMaybe 50.0 (toMaybe params.limit))) 100
  let serendipityCount = Int.ceil (Int.toNumber resultLimit * 0.15)
  let mainCount = resultLimit - serendipityCount
  heard <- run ctx.readDb (selectFieldsFrom { trackId: T.scrobblesC.trackId } T.scrobbles
    # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id)) # groupBy [toSQL T.scrobblesC.trackId]) :: Aff (Array { trackId :: Nullable String })
  loved <- run ctx.db (selectFieldsFrom { trackId: T.lovedTracksC.trackId } T.lovedTracks
    # where_ (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id))) :: Aff (Array { trackId :: Nullable String })
  let lovedIds = A.mapMaybe (toMaybe <<< _.trackId) loved
  let excludedIds = A.nub (A.mapMaybe (toMaybe <<< _.trackId) heard <> lovedIds)
  let heardSet = Set.fromFoldable excludedIds
  let playScore = SQL.template ["sum(exp(-0.02 * extract(epoch from (now() - ", ")) / 86400))"] [toSQL T.scrobblesC.timestamp]
  profile <- run ctx.readDb (selectFieldsFrom { artistId: T.scrobblesC.artistId } T.scrobbles
    # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id)) # groupBy [toSQL T.scrobblesC.artistId] # orderBy [SQL.desc playScore] # limit 200) :: Aff (Array { artistId :: Nullable String })
  let artistIds = A.mapMaybe (toMaybe <<< _.artistId) profile
  if A.null artistIds then pure { candidates: [], userGenres: Set.empty } else do
    genreData <- sequential $ { artists: _, liked: _ }
      <$> parallel (run ctx.readDb (selectFieldsFrom { genres: T.artistsC.genres, scrobbles: T.userArtistsC.scrobbles } T.userArtists
        # innerJoin T.artists (SQL.eq (toSQL T.userArtistsC.artistId) (toSQL T.artistsC.id))
        # where_ (SQL.eq (toSQL T.userArtistsC.userId) (SQL.string user.id)) # orderBy [SQL.desc (toSQL T.userArtistsC.scrobbles)] # limit 200) :: Aff (Array { genres :: Nullable (Array String), scrobbles :: Nullable Number }))
      <*> parallel (if A.null lovedIds then pure [] else do
        rows <- run ctx.readDb (selectFieldsFrom { genres: T.artistsC.genres } T.tracks
          # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
          # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string (A.take 200 lovedIds)))) :: Aff (Array { genres :: Nullable (Array String) })
        pure (A.concatMap (fromMaybe [] <<< toMaybe <<< _.genres) rows))
    let userGenres = Artists.genreProfile
          (A.mapWithIndex (\i r -> { artistId: show i, scrobbles: r.scrobbles }) genreData.artists)
          (A.mapWithIndex (\i r -> { id: show i, genres: r.genres }) genreData.artists) genreData.liked
    let sharedCount = SQL.template ["count(distinct ", ")"] [toSQL T.scrobblesC.artistId]
    neighbours <- run ctx.readDb (selectFieldsFrom { userId: T.scrobblesC.userId, sharedCount } T.scrobbles
      # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.artistId) (map SQL.string artistIds)) (SQL.ne (toSQL T.scrobblesC.userId) (SQL.string user.id)))
      # groupBy [toSQL T.scrobblesC.userId] # orderBy [SQL.desc sharedCount] # limit 50) :: Aff (Array { userId :: Nullable String, sharedCount :: Number })
    let neighbourIds = A.mapMaybe (toMaybe <<< _.userId) neighbours
    let similarities = Map.fromFoldable (A.mapMaybe (\r -> (\id -> Tuple id (r.sharedCount / Int.toNumber (A.length artistIds))) <$> toMaybe r.userId) neighbours)
    if A.null neighbourIds then pure { candidates: [], userGenres } else do
      let exclude column ids condition = if A.null ids then condition else SQL.and condition (SQL.notInArray column (map SQL.string ids))
      neighbourLoved <- run ctx.db (selectFieldsFrom { trackId: T.lovedTracksC.trackId, userId: T.lovedTracksC.userId } T.lovedTracks
        # where_ (exclude (toSQL T.lovedTracksC.trackId) excludedIds (SQL.inArray (toSQL T.lovedTracksC.userId) (map SQL.string neighbourIds)))) :: Aff (Array Loved)
      neighbourTracks <- run ctx.readDb (selectFieldsFrom { trackId: T.scrobblesC.trackId, neighbourUserId: T.scrobblesC.userId, playScore } T.scrobbles
        # where_ (exclude (toSQL T.scrobblesC.trackId) (A.take 500 excludedIds) (SQL.inArray (toSQL T.scrobblesC.userId) (map SQL.string neighbourIds)))
        # groupBy [toSQL T.scrobblesC.trackId, toSQL T.scrobblesC.userId] # orderBy [SQL.desc playScore] # limit 500) :: Aff (Array { trackId :: Nullable String, neighbourUserId :: Nullable String, playScore :: Number })
      let scored = scoreCandidates heardSet similarities neighbourLoved neighbourTracks
      filtered <- if Set.isEmpty userGenres || A.null scored then pure scored else do
        rows <- run ctx.readDb (selectFieldsFrom { id: T.tracksC.id, artist: T.tracksC.artist, genres: T.artistsC.genres } T.tracks
          # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
          # where_ (SQL.inArray (toSQL T.tracksC.id) (map (SQL.string <<< _.trackId) scored))) :: Aff (Array { id :: String, artist :: Nullable String, genres :: Nullable (Array String) })
        let allowed = Set.fromFoldable (map _.id (A.filter (\r -> S.toLower (fromMaybe "" (toMaybe r.artist)) /= "various artists" && A.any (flip Set.member userGenres) (fromMaybe [] (toMaybe r.genres))) rows))
        pure (A.filter (\r -> Set.member r.trackId allowed) scored)
      let main = A.take mainCount (A.sortBy (\a b -> compare b.score a.score) filtered)
      let needed = mainCount - A.length main
      extra <- if needed <= 0 || Set.isEmpty userGenres then pure [] else do
        let genres = Set.toUnfoldable userGenres :: Array String
        let genreCondition = fromMaybe (SQL.raw "false") (SQL.orAll (map (\g -> SQL.template ["", " @> ARRAY[", "]::text[]"] [toSQL T.artistsC.genres, SQL.string g]) genres))
        rows <- run ctx.readDb (selectFieldsFrom { id: T.tracksC.id } T.tracks
          # innerJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
          # where_ (exclude (toSQL T.tracksC.id) (A.take 500 excludedIds) (SQL.and genreCondition (SQL.template ["lower(", ") != 'various artists'"] [toSQL T.artistsC.name])))
          # orderBy [SQL.raw "random()"] # limit (needed * 5)) :: Aff (Array { id :: String })
        let picked = Set.fromFoldable (map _.trackId main)
        pure (map (\r -> { trackId: r.id, score: 0.0, source: "serendipity" }) (A.take needed (A.filter (\r -> not (Set.member r.id picked) && not (Set.member r.id heardSet)) rows)))
      let mainCandidates = main <> extra
      serendipityArtists <- run ctx.readDb (selectFieldsFrom { artistId: T.scrobblesC.artistId } T.scrobbles
        # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.userId) (map SQL.string neighbourIds)) (SQL.notInArray (toSQL T.scrobblesC.artistId) (map SQL.string artistIds)))
        # groupBy [toSQL T.scrobblesC.artistId] # orderBy [SQL.desc SQL.count] # limit 150) :: Aff (Array { artistId :: Nullable String })
      let newIds = A.mapMaybe (toMaybe <<< _.artistId) serendipityArtists
      newArtists <- if A.null newIds then pure [] else run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, name: T.artistsC.name, genres: T.artistsC.genres } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string newIds))) :: Aff (Array { id :: String, name :: Nullable String, genres :: Nullable (Array String) })
      let allowedIds = map _.id (A.filter (\r -> S.toLower (fromMaybe "" (toMaybe r.name)) /= "various artists" &&
            (Set.isEmpty userGenres || A.any (flip Set.member userGenres) (fromMaybe [] (toMaybe r.genres)))) newArtists)
      uriRows <- if A.null allowedIds then pure [] else run ctx.readDb (selectFieldsFrom { uri: T.artistsC.uri } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string allowedIds))) :: Aff (Array { uri :: Nullable String })
      let uris = A.mapMaybe (toMaybe <<< _.uri) uriRows
      tailRows <- if A.null uris then pure [] else run ctx.readDb (selectFieldsFrom { id: T.tracksC.id } T.tracks
        # where_ (exclude (toSQL T.tracksC.id) excludedIds (SQL.inArray (toSQL T.tracksC.artistUri) (map SQL.string uris)))
        # orderBy [SQL.raw "random()"] # limit (serendipityCount * 3)) :: Aff (Array { id :: String })
      let returned = Set.fromFoldable (map _.trackId mainCandidates)
      let tail = map (\r -> { trackId: r.id, score: 0.0, source: "serendipity" }) (A.take serendipityCount (A.filter (\r -> not (Set.member r.id returned)) tailRows))
      pure { candidates: mainCandidates <> tail, userGenres }

hydrate :: Context -> Retrieved -> Aff Foreign
hydrate ctx { candidates, userGenres } = do
  let ids = map _.trackId candidates
  if A.null ids then pure (F.toForeign { recommendations: [] :: Array Foreign }) else do
    data_ <- sequential $ { tracks: _, likes: _ }
      <$> parallel (run ctx.readDb (selectFieldsFrom
        { id: T.tracksC.id, title: T.tracksC.title, artist: T.tracksC.artist, album: T.tracksC.album, albumArt: T.tracksC.albumArt, trackUri: T.tracksC.uri, artistUri: T.artistsC.uri, albumUri: T.albumsC.uri, genres: T.artistsC.genres } T.tracks
        # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
        # leftJoin T.albums (SQL.eq (toSQL T.tracksC.albumUri) (toSQL T.albumsC.uri))
        # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string ids))) :: Aff (Array Track))
      <*> parallel (run ctx.db (selectFieldsFrom { trackId: T.lovedTracksC.trackId, count: SQL.count } T.lovedTracks
        # where_ (SQL.inArray (toSQL T.lovedTracksC.trackId) (map SQL.string ids)) # groupBy [toSQL T.lovedTracksC.trackId]) :: Aff (Array { trackId :: String, count :: Foreign }))
    let tracks = Map.fromFoldable (map (\r -> Tuple r.id r) data_.tracks)
    let likes = Map.fromFoldable (map (\r -> Tuple r.trackId (fromMaybe 0.0 (Number.fromString (F.stringValue r.count)))) data_.likes)
    let scores = Map.fromFoldable (map (\c -> Tuple c.trackId c) candidates)
    let items = A.mapMaybe (\id -> do
          track <- Map.lookup id tracks
          candidate <- Map.lookup id scores
          let genres = fromMaybe [] (toMaybe track.genres)
          if S.toLower (fromMaybe "" (toMaybe track.artist)) == "various artists" || (not (Set.isEmpty userGenres) && not (A.any (flip Set.member userGenres) genres)) then Nothing
          else Just { track, candidate, genres, likesCount: fromMaybe 0.0 (Map.lookup id likes) }) ids
    let ordered = foldl (\acc item ->
          let key = fromMaybe item.track.id (toMaybe item.track.artistUri)
          in if Set.member key acc.seen then acc { overflow = A.snoc acc.overflow item }
          else acc { seen = Set.insert key acc.seen, unique = A.snoc acc.unique item })
          { seen: Set.empty, unique: [], overflow: [] } (A.sortBy (\a b -> compare b.candidate.score a.candidate.score) items)
    pure (F.toForeign { recommendations: map (\{ track, candidate, genres, likesCount } -> F.omitNulls (F.toForeign
      { title: track.title, artist: track.artist, album: track.album, albumArt: track.albumArt, trackUri: track.trackUri, artistUri: track.artistUri, albumUri: track.albumUri, genres, recommendationScore: candidate.score, source: candidate.source, likesCount })) (ordered.unique <> ordered.overflow) })

getRecommendations :: Context -> Common.QueryParams -> Aff Foreign
getRecommendations ctx params = retrieve ctx params >>= hydrate ctx

register :: Server -> Context -> Effect Unit
register server ctx = do
  get <- Common.cached "getRecommendations" "/v1/recommendations" (F.toForeign { recommendations: [] :: Array Foreign }) (getRecommendations ctx)
  Xrpc.method server "app.rocksky.feed.getRecommendations" { auth: Nothing, handler: \input -> Xrpc.Json <$> get (Util.params input) }
