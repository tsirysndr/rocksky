module Rocksky.Scripts.DedupRecords (main, deduplicate, identityKey, plan, repoint, parseOptions, RepoRecord, Plan) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, null, toMaybe)
import Data.Set as Set
import Data.String (Pattern(..), split, stripPrefix, toLower)
import Data.Traversable (for_)
import Drizzle.Builder (innerJoin, run, selectFieldsFrom)
import Drizzle.Database (executeResult)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, localeCompare, resolveDid, rkeyOf, runScript, scriptArgs)

type RepoRecord = { uri :: String, rkey :: String, createdAt :: String, key :: String }
type Plan = { keeper :: RepoRecord, gone :: Array RepoRecord }
type Options = { target :: String, dryRun :: Boolean, collections :: Array String }

nsid :: String -> String
nsid name = "app.rocksky." <> name

identityKey :: String -> Foreign -> Maybe String
identityKey collection value = do
  let s key = case F.readStringAt key value of
        Just v | v /= "" -> Just v
        _ -> Nothing
  case collection of
    "artist" -> toLower <$> s "name"
    "album" -> (\title artist -> toLower (title <> " - " <> artist)) <$> s "title" <*> s "artist"
    "song" -> (\title artist album -> toLower (title <> " - " <> artist <> " - " <> album)) <$> s "title" <*> s "artist" <*> s "album"
    _ -> Nothing

parseOptions :: Array String -> Maybe Options
parseOptions args = do
  let
    only = A.elemIndex "--only" args >>= \i -> A.index args (i + 1)
    collections = fromMaybe ["artist", "album", "song"] (split (Pattern ",") <$> only)
    isOption s = case stripPrefix (Pattern "--") s of
      Just _ -> true
      _ -> false
  target <- A.find (\arg -> not (isOption arg) && Just arg /= only) args
  if target == "" || A.any (\c -> not (A.elem c ["artist", "album", "song"])) collections then Nothing
  else Just { target, collections, dryRun: A.elem "--dry-run" args }

plan :: Array RepoRecord -> Set.Set String -> Array Plan
plan records linked = A.mapMaybe makePlan keys
  where
  groups = foldl (\m r -> Map.alter (Just <<< (\rs -> rs <> [r]) <<< fromMaybe []) r.key m) Map.empty records
  keys = A.nub (map _.key records)
  makePlan key = do
    group <- Map.lookup key groups
    if A.length group <= 1 then Nothing else do
      let sorted = A.sortBy (\a b -> case compare (localeCompare a.createdAt b.createdAt) 0 of
            EQ -> compare (localeCompare a.rkey b.rkey) 0
            order -> order) group
      first <- A.head sorted
      let keeper = fromMaybe first (A.find (\r -> Set.member r.uri linked) sorted)
      pure { keeper, gone: A.filter (\r -> r.uri /= keeper.uri) group }

listAll :: Api.Agent -> String -> String -> Aff (Array RepoRecord)
listAll agent repo collection = page null []
  where
  page cursor acc = do
    result <- Api.listRecords agent { repo, collection: nsid collection, limit: 100, cursor }
    let records = A.mapMaybe (\r -> do
          key <- identityKey collection r.value
          pure { uri: r.uri, rkey: rkeyOf r.uri, key, createdAt: fromMaybe "" (F.readStringAt "createdAt" r.value) }) result.records
    let next = acc <> records
    case toMaybe result.cursor of
      Just c | c /= "" -> page (notNull c) next
      _ -> pure next

linkedUris :: Context -> String -> String -> Aff (Set.Set String)
linkedUris ctx did collection = do
  let condition = SQL.eq (toSQL T.usersC.did) (SQL.string did)
  rows <- case collection of
    "artist" -> run ctx.db (selectFieldsFrom { uri: T.userArtistsC.uri } T.userArtists # innerJoin T.users (SQL.eq (toSQL T.userArtistsC.userId) (toSQL T.usersC.id)) # where_ condition)
    "album" -> run ctx.db (selectFieldsFrom { uri: T.userAlbumsC.uri } T.userAlbums # innerJoin T.users (SQL.eq (toSQL T.userAlbumsC.userId) (toSQL T.usersC.id)) # where_ condition)
    _ -> run ctx.db (selectFieldsFrom { uri: T.userTracksC.uri } T.userTracks # innerJoin T.users (SQL.eq (toSQL T.userTracksC.userId) (toSQL T.usersC.id)) # where_ condition)
  pure (Set.fromFoldable (A.mapMaybe (toMaybe <<< _.uri) (rows :: Array { uri :: Nullable String })))

repoint :: Context -> String -> String -> Array String -> Aff Unit
repoint ctx collection keeper gone = for_ refs \ref -> do
  result <- attempt (executeResult ctx.db (SQL.template ["UPDATE ", " SET ", " = ", " WHERE ", ""]
    [ref.table, SQL.identifier ref.name, SQL.string keeper, SQL.inArray ref.column (map SQL.string gone)]))
  case result of
    Left e -> liftEffect (Log.warn ("  could not repoint " <> ref.name <> " to " <> keeper <> ": " <> message e))
    Right response -> do
      let count = fromMaybe 0 (F.readIntAt "rowCount" response)
      when (count > 0) (liftEffect (Log.info ("  " <> ref.name <> ": " <> show count <> " row(s) → " <> keeper)))
  where
  refs = case collection of
    "artist" ->
      [ { table: tableSQL T.userArtists, column: toSQL T.userArtistsC.uri, name: "uri" }
      , { table: tableSQL T.artists, column: toSQL T.artistsC.uri, name: "uri" }
      , { table: tableSQL T.tracks, column: toSQL T.tracksC.artistUri, name: "artist_uri" }
      , { table: tableSQL T.albums, column: toSQL T.albumsC.artistUri, name: "artist_uri" } ]
    "album" ->
      [ { table: tableSQL T.userAlbums, column: toSQL T.userAlbumsC.uri, name: "uri" }
      , { table: tableSQL T.albums, column: toSQL T.albumsC.uri, name: "uri" }
      , { table: tableSQL T.tracks, column: toSQL T.tracksC.albumUri, name: "album_uri" } ]
    _ ->
      [ { table: tableSQL T.userTracks, column: toSQL T.userTracksC.uri, name: "uri" }
      , { table: tableSQL T.tracks, column: toSQL T.tracksC.uri, name: "uri" } ]

deduplicate :: Context -> Api.Agent -> String -> Boolean -> Array String -> Aff Unit -> Aff Unit
deduplicate ctx agent did dryRun collections pause = do
  repo <- liftEffect (Api.assertDid agent)
  for_ collections \collection -> do
    liftEffect (Log.info ("\n" <> nsid collection))
    data_ <- sequential $ { records: _, linked: _ } <$> parallel (listAll agent repo collection) <*> parallel (linkedUris ctx did collection)
    let plans = plan data_.records data_.linked
    let gone = A.concatMap _.gone plans
    liftEffect (Log.info (show (A.length data_.records) <> " records, " <> show (A.length (A.nub (map _.key data_.records))) <> " distinct, " <> show (A.length plans) <> " duplicated (" <> show (A.length gone) <> " to delete)"))
    for_ plans \p -> liftEffect (Log.info ("keep " <> p.keeper.uri <> "  -" <> show (A.length p.gone) <> "  " <> p.keeper.key))
    unless dryRun do
      let remove at rest = unless (A.null rest) do
            let batch = A.take 100 rest
            Api.applyWrites agent repo (map (\r -> F.toForeign { "$type": "com.atproto.repo.applyWrites#delete", collection: nsid collection, rkey: r.rkey }) batch)
            liftEffect (Log.info ("  deleted " <> show (at + A.length batch) <> "/" <> show (A.length gone) <> " " <> nsid collection))
            pause
            remove (at + A.length batch) (A.drop 100 rest)
      remove 0 gone
      for_ plans \p -> repoint ctx collection p.keeper.uri (map _.uri p.gone)
  liftEffect (Log.info (if dryRun then "\nDry run complete." else "\nDeduplication complete."))

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  opts <- case parseOptions args of
    Just value -> pure value
    Nothing -> do
      liftEffect (Log.error "Usage: node bin/run.js Rocksky.Scripts.DedupRecords <handle|did> [--dry-run] [--only artist,album,song]")
      exit 1
  did <- case stripPrefix (Pattern "did:") opts.target of
    Just _ -> pure opts.target
    Nothing -> resolveDid ctx opts.target
  possible <- createAgent ctx did
  agent <- case possible of
    Just value -> pure value
    Nothing -> do
      liftEffect (Log.error ("No PDS session for " <> did <> " — the user has to log in again."))
      exit 1
  deduplicate ctx agent did opts.dryRun opts.collections (sleep 500)
  exit 0
