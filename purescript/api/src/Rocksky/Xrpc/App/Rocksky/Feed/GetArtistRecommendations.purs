module Rocksky.Xrpc.App.Rocksky.Feed.GetArtistRecommendations where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Foldable (foldl, sum)
import Data.Int as Int
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Set as Set
import Data.String as S
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, leftJoin, limit, orderBy, run, selectFieldsFrom)
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
import Rocksky.Xrpc.App.Rocksky.Feed.RecommendationCommon as Common
import Rocksky.Xrpc.Util as Util

type Candidate = { artistId :: String, score :: Number, source :: String }
type Retrieved = { candidates :: Array Candidate, userGenres :: Set.Set String }
type Heard = { artistId :: String, scrobbles :: Nullable Number }
type GenreArtist = { id :: String, genres :: Nullable (Array String) }
type Artist = { id :: String, uri :: Nullable String, name :: String, picture :: Nullable String, genres :: Nullable (Array String) }

-- Arrays retain JS Map insertion order when scores tie.
genreProfile :: Array Heard -> Array GenreArtist -> Array String -> Set.Set String
genreProfile heard artists liked = Set.fromFoldable (map _.genre selected)
  where
  familiarity = Map.fromFoldable (map (\r -> Tuple r.artistId (fromMaybe 1.0 (toMaybe r.scrobbles))) heard)
  add weight acc genre = case A.findIndex (\r -> r.genre == genre) acc of
    Nothing -> A.snoc acc { genre, weight }
    Just index -> fromMaybe acc (A.modifyAt index (\r -> r { weight = r.weight + weight }) acc)
  weighted = foldl (\acc artist -> foldl (add (fromMaybe 1.0 (Map.lookup artist.id familiarity))) acc (fromMaybe [] (toMaybe artist.genres))) [] artists
  weights = foldl (add 50.0) weighted liked
  total = let n = sum (map _.weight weights) in if n == 0.0 then 1.0 else n
  selected = A.take 10 (A.filter (\r -> r.weight / total >= 0.05) (A.sortBy (\a b -> compare b.weight a.weight) weights))

scoreCandidates :: Set.Set String -> Map.Map String Number -> Array { artistId :: Nullable String, neighbourUserId :: Nullable String, playScore :: Number } -> Array Candidate
scoreCandidates heard similarities = foldl add []
  where
  add acc row = case toMaybe row.artistId, toMaybe row.neighbourUserId of
    Just id, Just neighbour | id /= "" && neighbour /= "" && not (Set.member id heard) ->
      let score = fromMaybe 0.0 (Map.lookup neighbour similarities) * row.playScore
      in case A.findIndex (\c -> c.artistId == id) acc of
        Nothing | score > 0.0 -> A.snoc acc { artistId: id, score, source: "neighbour" }
        Just index -> fromMaybe acc (A.modifyAt index (\c -> if score > c.score then c { score = score } else c) acc)
        _ -> acc
    _, _ -> acc

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
  heard <- run ctx.readDb (selectFieldsFrom { artistId: T.userArtistsC.artistId, scrobbles: T.userArtistsC.scrobbles } T.userArtists
    # where_ (SQL.eq (toSQL T.userArtistsC.userId) (SQL.string user.id))) :: Aff (Array Heard)
  let heardIds = map _.artistId heard
  let heardSet = Set.fromFoldable heardIds
  if A.null heardIds then pure { candidates: [], userGenres: Set.empty } else do
    loved <- run ctx.db (selectFieldsFrom { trackId: T.lovedTracksC.trackId } T.lovedTracks
      # where_ (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id))) :: Aff (Array { trackId :: Nullable String })
    let lovedIds = A.mapMaybe (toMaybe <<< _.trackId) loved
    genreData <- sequential $ { artists: _, liked: _ }
      <$> parallel (run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, genres: T.artistsC.genres } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string heardIds))) :: Aff (Array GenreArtist))
      <*> parallel (if A.null lovedIds then pure [] else do
        rows <- run ctx.readDb (selectFieldsFrom { genres: T.artistsC.genres } T.tracks
          # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
          # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string (A.take 200 lovedIds)))) :: Aff (Array { genres :: Nullable (Array String) })
        pure (A.concatMap (fromMaybe [] <<< toMaybe <<< _.genres) rows))
    let userGenres = genreProfile heard genreData.artists genreData.liked
    let sharedCount = SQL.template ["count(distinct ", ")"] [toSQL T.scrobblesC.artistId]
    neighbours <- run ctx.readDb (selectFieldsFrom { userId: T.scrobblesC.userId, sharedCount } T.scrobbles
      # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.artistId) (map SQL.string heardIds)) (SQL.ne (toSQL T.scrobblesC.userId) (SQL.string user.id)))
      # groupBy [toSQL T.scrobblesC.userId] # orderBy [SQL.desc sharedCount] # limit 50) :: Aff (Array { userId :: Nullable String, sharedCount :: Number })
    let neighbourIds = A.mapMaybe (toMaybe <<< _.userId) neighbours
    let similarities = Map.fromFoldable (A.mapMaybe (\n -> (\id -> Tuple id (n.sharedCount / Int.toNumber (A.length heardIds))) <$> toMaybe n.userId) neighbours)
    if A.null neighbourIds then pure { candidates: [], userGenres } else do
      let playScore = SQL.template ["sum(exp(-0.02 * extract(epoch from (now() - ", ")) / 86400))"] [toSQL T.scrobblesC.timestamp]
      rows <- run ctx.readDb (selectFieldsFrom { artistId: T.scrobblesC.artistId, neighbourUserId: T.scrobblesC.userId, playScore } T.scrobbles
        # where_ (SQL.and (SQL.inArray (toSQL T.scrobblesC.userId) (map SQL.string neighbourIds)) (SQL.notInArray (toSQL T.scrobblesC.artistId) (map SQL.string (A.take 500 heardIds))))
        # groupBy [toSQL T.scrobblesC.artistId, toSQL T.scrobblesC.userId] # orderBy [SQL.desc playScore] # limit 500) :: Aff (Array { artistId :: Nullable String, neighbourUserId :: Nullable String, playScore :: Number })
      let scored = scoreCandidates heardSet similarities rows
      filtered <- if Set.isEmpty userGenres || A.null scored then pure scored else do
        genres <- run ctx.readDb (selectFieldsFrom { id: T.artistsC.id, name: T.artistsC.name, genres: T.artistsC.genres } T.artists
          # where_ (SQL.inArray (toSQL T.artistsC.id) (map (SQL.string <<< _.artistId) scored))) :: Aff (Array { id :: String, name :: String, genres :: Nullable (Array String) })
        let allowed = Set.fromFoldable (map _.id (A.filter (\r -> S.toLower r.name /= "various artists" && A.any (flip Set.member userGenres) (fromMaybe [] (toMaybe r.genres))) genres))
        pure (A.filter (\c -> Set.member c.artistId allowed) scored)
      let sorted = A.sortBy (\a b -> compare b.score a.score) filtered
      let main = A.take mainCount sorted
      let returned = Set.fromFoldable (map _.artistId main)
      let supplemental needed minimum already = if needed <= 0 || Set.isEmpty userGenres then pure [] else do
            let genres = Set.toUnfoldable userGenres :: Array String
            let genreCondition = fromMaybe (SQL.raw "false") (SQL.orAll (map (\g -> SQL.template ["", " @> ARRAY[", "]::text[]"] [toSQL T.artistsC.genres, SQL.string g]) genres))
            extra <- run ctx.readDb (selectFieldsFrom { id: T.artistsC.id } T.artists
              # where_ (SQL.and genreCondition (SQL.and (SQL.template ["lower(", ") != 'various artists'"] [toSQL T.artistsC.name]) (SQL.notInArray (toSQL T.artistsC.id) (map SQL.string (A.take 2000 heardIds)))))
              # orderBy [SQL.raw "random()"] # limit (max (needed * 20) minimum)) :: Aff (Array { id :: String })
            pure (map (\r -> { artistId: r.id, score: 0.0, source: "serendipity" }) (A.take needed (A.filter (\r -> not (Set.member r.id already) && not (Set.member r.id heardSet)) extra)))
      extraMain <- supplemental (mainCount - A.length main) 300 returned
      let mainCandidates = main <> extraMain
      let alreadyReturned = Set.fromFoldable (map _.artistId mainCandidates)
      let tail = map (\c -> c { source = "serendipity" }) (A.take serendipityCount (A.filter (\c -> not (Set.member c.artistId alreadyReturned)) (A.slice mainCount (mainCount + serendipityCount * 3) sorted)))
      -- The source excludes main IDs only, so the supplement may duplicate tail IDs.
      extraTail <- supplemental (serendipityCount - A.length tail) 100 alreadyReturned
      pure { candidates: mainCandidates <> tail <> extraTail, userGenres }

hydrate :: Context -> Retrieved -> Aff Foreign
hydrate ctx { candidates, userGenres } = do
  let ids = map _.artistId candidates
  rows <- if A.null ids then pure [] else run ctx.readDb (selectFieldsFrom
    { id: T.artistsC.id, uri: T.artistsC.uri, name: T.artistsC.name, picture: T.artistsC.picture, genres: T.artistsC.genres } T.artists
    # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string ids))) :: Aff (Array Artist)
  let artists = Map.fromFoldable (map (\r -> Tuple r.id r) rows)
  let scores = Map.fromFoldable (map (\c -> Tuple c.artistId c) candidates)
  let present id = do
        artist <- Map.lookup id artists
        candidate <- Map.lookup id scores
        let genres = fromMaybe [] (toMaybe artist.genres)
        if S.toLower artist.name == "various artists" || (not (Set.isEmpty userGenres) && not (A.any (flip Set.member userGenres) genres)) then Nothing
        else Just (F.omitNulls (F.toForeign { id: artist.id, uri: artist.uri, name: artist.name, picture: artist.picture, genres, recommendationScore: candidate.score, source: candidate.source }))
  pure (F.toForeign { artists: A.mapMaybe present ids })

getArtistRecommendations :: Context -> Common.QueryParams -> Aff Foreign
getArtistRecommendations ctx params = retrieve ctx params >>= hydrate ctx

register :: Server -> Context -> Effect Unit
register server ctx = do
  get <- Common.cached "getArtistRecommendations" "/v1/recommendations/artists" (F.toForeign { artists: [] :: Array Foreign }) (getArtistRecommendations ctx)
  Xrpc.method server "app.rocksky.feed.getArtistRecommendations" { auth: Nothing, handler: \input -> Xrpc.Json <$> get (Util.params input) }
