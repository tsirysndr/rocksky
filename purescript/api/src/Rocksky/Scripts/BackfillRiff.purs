module Rocksky.Scripts.BackfillRiff where

import Prelude
import Consola as Log
import Control.Parallel (parTraverse_)
import Data.Array as A
import Data.Array.NonEmpty as NE
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (null, notNull, toMaybe)
import Data.Number as Number
import Data.String as S
import Data.String.CodeUnits as CU
import Data.String.Regex as Regex
import Data.String.Regex.Flags (ignoreCase, global, noFlags)
import Data.Traversable (traverse, for_)
import Drizzle.Builder (limitNumber, orderBy, run, runUpdate, selectFieldsFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Effect.Ref as Ref
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import JSURI (encodeURIComponent)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Matching (matchTrack, matchingRequest)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (envNumber, envLimit, envString, envFlag, exit, parseInt10, runScript, showNumber)

type Stats = { scanned :: Number, updated :: Number, missed :: Number, clean :: Number, artReplaced :: Number, errors :: Number }
type Options = { url :: String, pageSize :: Number, concurrency :: Number, limit :: Number, only :: String, dryRun :: Boolean, quiet :: Boolean }
type Client = { request :: String -> Ref.Ref Stats -> Aff (Maybe Foreign), memo :: Ref.Ref (Object.Object (Maybe Foreign)), match :: Foreign -> Aff (Maybe String) }
emptyStats :: Stats
emptyStats = { scanned: 0.0, updated: 0.0, missed: 0.0, clean: 0.0, artReplaced: 0.0, errors: 0.0 }

replaceable :: String -> Boolean
replaceable s = A.any (\prefix -> isJust (S.stripPrefix (S.Pattern prefix) s)) ["https://cdn.rocksky.app", "https://cdn.bsky.app"]
field :: String -> Foreign -> Foreign
field key row = fromMaybe F.undefined (F.asObject row >>= Object.lookup key)
str :: String -> Foreign -> String
str key = fromMaybe "" <<< F.readStringAt key
number :: String -> Foreign -> Number
number key row = fromMaybe (0.0 / 0.0) (F.path key row >>= F.asNumber)
isNullField :: String -> Foreign -> Boolean
isNullField key row = F.stringify (field key row) == "null"
bestImage :: Foreign -> Maybe String
bestImage value = F.readStringAt "0.url" value >>= \url -> if url /= "" && not (replaceable url) then Just url else Nothing
regexReplace :: String -> String -> String
regexReplace pattern value = case Regex.regex pattern ignoreCase of
  Right re -> Regex.replace re "" value
  Left _ -> value
spotifyId :: String -> String -> Maybe String
spotifyId kind link = case Regex.regex ("open\\.spotify\\.com/" <> kind <> "/([A-Za-z0-9]+)") noFlags of
  Right re -> Regex.match re link >>= \m -> A.index (NE.toArray m) 1 >>= identity
  Left _ -> Nothing
primaryArtist :: String -> String
primaryArtist name = case Regex.regex ",|\\sfeat\\.?\\s|\\sft\\.?\\s|\\s&\\s" ignoreCase of
  Right re -> S.trim (fromMaybe "" (A.head (Regex.split re name)))
  Left _ -> S.trim name
titleVariants :: String -> Array String
titleVariants title = foldl add [title]
  [ "\\s*[-–—]\\s*from\\s+[\"“].*$"
  , "\\s*\\(\\s*from\\s+[^)]*\\)\\s*$"
  , "\\s*[([]\\s*(feat|ft|with)\\.?\\s+[^)\\]]*[)\\]]\\s*$"
  , "\\s*[-–—]\\s*(remaster(ed)?(\\s+\\d{4})?|single version|radio edit|album version|mono|stereo|live|bonus track|extended(\\s+mix)?|original mix)\\s*$"
  , "\\s*\\([^)]*\\)\\s*$"
  ]
  where
  add variants pattern =
    let trimmed = S.trim (regexReplace pattern title)
        value = case Regex.regex "\\s{2,}" global of
          Right re -> Regex.replace re " " trimmed
          Left _ -> trimmed
    in if CU.length value > 1 && not (A.elem value variants) then A.snoc variants value else variants

memoized :: Client -> String -> Aff (Maybe Foreign) -> Aff (Maybe Foreign)
memoized client key action = do
  cache <- liftEffect (Ref.read client.memo)
  case Object.lookup key cache of
    Just hit -> pure hit
    Nothing -> do
      hit <- action
      liftEffect (Ref.modify_ (Object.insert key hit) client.memo)
      pure hit

searchOne :: Client -> Ref.Ref Stats -> String -> String -> Aff (Maybe Foreign)
searchOne client stats kind query = memoized client (kind <> "search:" <> S.toLower query) do
  result <- client.request ("/search?type=" <> kind <> "&q=" <> fromMaybe query (encodeURIComponent query)) stats
  pure (result >>= F.path (kind <> "s.items.0"))

findHit :: Client -> Ref.Ref Stats -> String -> Foreign -> Aff (Maybe Foreign)
findHit client stats kind row = if kind == "tracks" then do
  id <- client.match row
  case id of
    Just value | value /= "" -> memoized client ("track:" <> value) (client.request ("/tracks/" <> value) stats)
    _ -> pure Nothing
  else do
    let singular = if kind == "albums" then "album" else "artist"
    direct <- case spotifyId singular (str "spotifyLink" row) of
      Just id -> memoized client (singular <> ":" <> id) (client.request ("/" <> kind <> "/" <> id) stats)
      Nothing -> pure Nothing
    case direct of
      Just _ -> pure direct
      Nothing | kind == "artists" -> searchOne client stats "artist" ("artist:\"" <> str "name" row <> "\"")
      Nothing -> do
        let go variants = case A.uncons variants of
              Nothing -> pure Nothing
              Just { head: title, tail } -> do
                hit <- searchOne client stats "album" ("album:\"" <> title <> "\" artist:\"" <> primaryArtist (str "artist" row) <> "\"")
                if isJust hit then pure hit else go tail
        go (titleVariants (str "title" row))

-- The count of replaced art advances before writes, even if a write fails.
patchFor :: String -> Foreign -> Foreign -> { patch :: Object.Object Foreign, artReplaced :: Boolean }
patchFor kind row hit =
  let add condition key value acc = if condition then Object.insert key value acc else acc
      images = if kind == "tracks" then fromMaybe F.undefined (F.path "album.images" hit) else field "images" hit
      art = bestImage images
      oldArt = str "albumArt" row
      fillArt = (isNullField "albumArt" row || replaceable oldArt) && isJust art
      linked = fromMaybe F.undefined (F.path "external_urls.spotify" hit)
      link = add (isNullField "spotifyLink" row && F.truthy linked) "spotifyLink" linked
      base = Object.empty
      artPatch = add fillArt "albumArt" (F.toForeign (fromMaybe "" art))
      year = parseInt10 (CU.take 4 (str "release_date" hit))
      patch = if kind == "tracks" then base
        # add (number "duration" row == 0.0 && number "duration_ms" hit > 0.0) "duration" (field "duration_ms" hit)
        # artPatch
        # add (isNullField "trackNumber" row && number "track_number" hit > 0.0) "trackNumber" (field "track_number" hit)
        # add (isNullField "discNumber" row && number "disc_number" hit > 0.0) "discNumber" (field "disc_number" hit)
        # add (isNullField "isrc" row && F.truthy (fromMaybe F.undefined (F.path "external_ids.isrc" hit))) "isrc" (fromMaybe F.undefined (F.path "external_ids.isrc" hit))
        # link
      else if kind == "albums" then base # artPatch
        # add (isNullField "releaseDate" row && F.truthy (field "release_date" hit)) "releaseDate" (field "release_date" hit)
        # add (isNullField "year" row && F.truthy (field "release_date" hit) && Number.isFinite year) "year" (F.toForeign year)
        # link
      else base
        # add (isNullField "picture" row && isJust art) "picture" (F.toForeign (fromMaybe "" art))
        # add ((isNullField "genres" row || A.null (fromMaybe [] (F.readArrayAt "genres" row))) && not (A.null (fromMaybe [] (F.readArrayAt "genres" hit)))) "genres" (field "genres" hit)
        # link
  in { patch, artReplaced: kind /= "artists" && fillArt && replaceable oldArt }

applyPatch :: Object.Object Foreign -> (Foreign -> Aff Unit) -> Aff Unit
applyPatch patch update = do
  result <- attempt (update (F.toForeign patch))
  case result of
    Right _ -> pure unit
    Left e -> do
      let message = F.stringValue (fromMaybe (F.toForeign e) (F.path "cause" (F.toForeign e)))
      if Object.member "spotifyLink" patch && (S.contains (S.Pattern "spotify_link") message || S.contains (S.Pattern "23505") message) then do
        let rest = Object.delete "spotifyLink" patch
        unless (Object.isEmpty rest) (update (F.toForeign rest))
      else throwError e

fill :: Options -> Client -> Ref.Ref Stats -> String -> (Foreign -> Foreign -> Aff Unit) -> Foreign -> Aff String
fill opts client stats kind update row = do
  hit <- findHit client stats kind row
  case hit of
    Nothing -> pure "missed"
    Just value -> do
      let result = patchFor kind row value
      when result.artReplaced (liftEffect (Ref.modify_ (\s -> s { artReplaced = s.artReplaced + 1.0 }) stats))
      if Object.isEmpty result.patch then pure "clean" else do
        unless opts.quiet (liftEffect (Log.info ((if opts.dryRun then "[dry] " else "") <> kind <> " " <> str (if kind == "artists" then "name" else "title") row <> ": " <> S.joinWith ", " (Object.keys result.patch))))
        unless opts.dryRun (applyPatch result.patch (update row))
        pure "updated"

walk :: Options -> Ref.Ref Stats -> String -> (String -> Aff (Array Foreign)) -> (Foreign -> Aff String) -> Aff Unit
walk opts stats label getPage work = go ""
  where
  go cursor = do
    current <- liftEffect (Ref.read stats)
    when (current.scanned < opts.limit) do
      page <- getPage cursor
      unless (A.null page) do
        queue <- liftEffect (Ref.new page)
        let worker = do
              claim <- liftEffect do
                s <- Ref.read stats
                rows <- Ref.read queue
                case A.uncons rows of
                  Just r | s.scanned < opts.limit -> do
                    Ref.write r.tail queue
                    Ref.write (s { scanned = s.scanned + 1.0 }) stats
                    pure (Just r.head)
                  _ -> pure Nothing
              case claim of
                Nothing -> pure unit
                Just row -> do
                  outcome <- attempt (work row)
                  liftEffect case outcome of
                    Right "updated" -> Ref.modify_ (\s -> s { updated = s.updated + 1.0 }) stats
                    Right "missed" -> Ref.modify_ (\s -> s { missed = s.missed + 1.0 }) stats
                    Right _ -> Ref.modify_ (\s -> s { clean = s.clean + 1.0 }) stats
                    Left e -> do
                      Ref.modify_ (\s -> s { errors = s.errors + 1.0 }) stats
                      Log.errorF (label <> " " <> str "id" row) [F.toForeign e]
                  worker
        parTraverse_ (const worker) (A.replicate (max 0 (Int.floor (min opts.concurrency (Int.toNumber (A.length page))))) unit)
        s <- liftEffect (Ref.read stats)
        liftEffect (Log.info (label <> ": " <> showNumber s.scanned <> " scanned, " <> showNumber s.updated <> " updated, " <> showNumber s.missed <> " missed, " <> showNumber s.errors <> " errors"))
        go (fromMaybe "" (A.last page >>= F.readStringAt "id"))

request :: String -> String -> Ref.Ref Stats -> Aff (Maybe Foreign)
request base path stats = do
  result <- attempt do
    signal <- liftEffect (Fetch.timeoutSignal 30000)
    response <- Fetch.fetchWith (base <> path) (Fetch.defaultOptions { signal = notNull signal })
    if Fetch.ok response then Just <$> Fetch.json response else pure Nothing
  case result of
    Right value -> pure value
    Left e -> do
      liftEffect do
        Ref.modify_ (\s -> s { errors = s.errors + 1.0 }) stats
        Log.warnF ("riff request failed: " <> path) [F.toForeign e]
      pure Nothing

fetchPage :: Context -> Options -> String -> String -> Aff (Array Foreign)
fetchPage ctx opts kind cursor = do
  let pending art = SQL.or (SQL.isNull art) (SQL.or (SQL.like art (SQL.string "https://cdn.rocksky.app%")) (SQL.like art (SQL.string "https://cdn.bsky.app%")))
  if kind == "tracks" then map F.toForeign <$> (run ctx.db (selectFieldsFrom
    { id: T.tracksC.id, title: T.tracksC.title, album: T.tracksC.album, artist: T.tracksC.artist, albumArt: T.tracksC.albumArt, duration: T.tracksC.duration, trackNumber: T.tracksC.trackNumber, discNumber: T.tracksC.discNumber, isrc: T.tracksC.isrc, spotifyLink: T.tracksC.spotifyLink } T.tracks
    # where_ (SQL.and (SQL.gt (toSQL T.tracksC.id) (SQL.string cursor)) (SQL.or (SQL.eq (toSQL T.tracksC.duration) (SQL.int 0)) (pending (toSQL T.tracksC.albumArt))))
    # orderBy [toSQL T.tracksC.id] # limitNumber opts.pageSize) :: Aff (Array {}))
  else if kind == "albums" then map F.toForeign <$> (run ctx.db (selectFieldsFrom
    { id: T.albumsC.id, title: T.albumsC.title, artist: T.albumsC.artist, albumArt: T.albumsC.albumArt, releaseDate: T.albumsC.releaseDate, year: T.albumsC.year, spotifyLink: T.albumsC.spotifyLink } T.albums
    # where_ (SQL.and (SQL.gt (toSQL T.albumsC.id) (SQL.string cursor)) (pending (toSQL T.albumsC.albumArt))) # orderBy [toSQL T.albumsC.id] # limitNumber opts.pageSize) :: Aff (Array {}))
  else map F.toForeign <$> (run ctx.db (selectFieldsFrom
    { id: T.artistsC.id, name: T.artistsC.name, picture: T.artistsC.picture, genres: T.artistsC.genres, spotifyLink: T.artistsC.spotifyLink } T.artists
    # where_ (SQL.and (SQL.gt (toSQL T.artistsC.id) (SQL.string cursor)) (SQL.isNull (toSQL T.artistsC.picture))) # orderBy [toSQL T.artistsC.id] # limitNumber opts.pageSize) :: Aff (Array {}))

updateRow :: Context -> String -> Foreign -> Foreign -> Aff Unit
updateRow ctx kind row patch =
  if kind == "tracks" then runUpdate ctx.db (updateForeign T.tracks patch # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string (str "id" row))))
  else if kind == "albums" then runUpdate ctx.db (updateForeign T.albums patch # where_ (SQL.eq (toSQL T.albumsC.id) (SQL.string (str "id" row))))
  else runUpdate ctx.db (updateForeign T.artists patch # where_ (SQL.eq (toSQL T.artistsC.id) (SQL.string (str "id" row))))

main :: Effect Unit
main = runScript do
  ctx <- createContext
  opts <- liftEffect do
    url <- fromMaybe "http://localhost:8092/v1" <$> envString "RIFF_API_URL"
    pageSize <- envNumber "BACKFILL_PAGE_SIZE" 500.0
    concurrency <- envNumber "BACKFILL_CONCURRENCY" 4.0
    limit <- envLimit "BACKFILL_LIMIT"
    only <- S.toLower <<< fromMaybe "all" <$> envString "BACKFILL_ONLY"
    dryRun <- envFlag "BACKFILL_DRY_RUN" "1"
    quiet <- envFlag "BACKFILL_QUIET" "1"
    pure { url: fromMaybe url (S.stripSuffix (S.Pattern "/") url), pageSize, concurrency, limit, only, dryRun, quiet }
  liftEffect (Log.info ("backfilling from riff at " <> opts.url <> if opts.dryRun then " (dry run)" else ""))
  health <- attempt do
    signal <- liftEffect (Fetch.timeoutSignal 5000)
    Fetch.fetchWith (fromMaybe opts.url (S.stripSuffix (S.Pattern "/v1") opts.url) <> "/health") (Fetch.defaultOptions { signal = notNull signal })
  unless (case health of
    Right r -> Fetch.ok r
    Left _ -> false) (throwError (error ("riff is not reachable at " <> opts.url <> " — start it first")))
  memo <- liftEffect (Ref.new Object.empty)
  let client = { memo, request: request opts.url, match: \row -> do
        query <- matchingRequest row
        candidate <- matchTrack ctx query null
        pure (toMaybe candidate >>= toMaybe <<< _.identifiers.spotifyTrackId) }
  walks <- liftEffect (traverse (\kind -> do
    stats <- Ref.new emptyStats
    pure { kind, stats }) ["tracks", "albums", "artists"])
  parTraverse_ (\{ kind, stats } ->
    when (opts.only == "all" || opts.only == kind) (walk opts stats kind (fetchPage ctx opts kind) (fill opts client stats kind (updateRow ctx kind)))) walks
  for_ walks \{ kind, stats } -> do
    s <- liftEffect (Ref.read stats)
    liftEffect (Log.success (kind <> ": " <> showNumber s.scanned <> " scanned, " <> showNumber s.updated <> " updated (" <> showNumber s.artReplaced <> " rocksky/bsky art URLs replaced), " <> showNumber s.missed <> " missed, " <> showNumber s.clean <> " already complete, " <> showNumber s.errors <> " errors"))
  exit 0
