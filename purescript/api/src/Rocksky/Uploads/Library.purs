module Rocksky.Uploads.Library (register, listUploads, listAlbums, listArtists, getQueue, putQueue, albumFilter, Listing) where

import Prelude
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Number as Number
import Data.Nullable (Nullable, toMaybe)
import Data.String as S
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, leftJoin, limit, limitNumber, offsetNumber, orderBy, run, runInsert, insertForeign, onConflictDoUpdate, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Schema as T
import Rocksky.Schema.UserUploads (SelectUserUpload)
import Rocksky.Typesense.Library as Search
import Rocksky.Uploads.DeleteService (purgeUploads)

type Listing = { size :: Number, offset :: Number, q :: String, albumUri :: String, albumArtist :: String, albumName :: String }
query :: Hono.Context -> String -> String
query c key = S.trim (fromMaybe "" (Hono.reqQuery c key))
queryNumber :: Hono.Context -> String -> Number -> Number
queryNumber c key fallback = case Hono.reqQuery c key >>= Number.fromString of
  Just n | n /= 0.0 && not (Number.isNaN n) -> n
  _ -> fallback
listing :: Hono.Context -> Listing
listing c = { size: min (queryNumber c "size" 50.0) 200.0, offset: queryNumber c "offset" 0.0, q: query c "q", albumUri: query c "albumUri", albumArtist: query c "albumArtist", albumName: query c "albumName" }
albumFilter :: Listing -> Maybe SQL.SQL
albumFilter p
  | p.albumUri /= "" = Just (SQL.eq (toSQL T.tracksC.albumUri) (SQL.string p.albumUri))
  | p.albumArtist /= "" && p.albumName /= "" = Just (SQL.and (SQL.eq (toSQL T.tracksC.albumArtist) (SQL.string p.albumArtist)) (SQL.eq (toSQL T.tracksC.album) (SQL.string p.albumName)))
  | otherwise = Nothing
owned :: String -> SQL.SQL
owned userId = SQL.eq (toSQL T.userUploadsC.userId) (SQL.string userId)

listUploads :: Context -> String -> Listing -> Aff (Array Foreign)
listUploads ctx userId p = do
  let base = selectFieldsFrom { upload: tableSQL T.userUploads, track: tableSQL T.tracks, albumReleaseDate: T.albumsC.releaseDate, albumYear: T.albumsC.year } T.userUploads
        # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id))
        # leftJoin T.albums (SQL.eq (toSQL T.albumsC.uri) (toSQL T.tracksC.albumUri))
  if p.q /= "" then do
    hits <- Search.searchLibraryTracksNumber ctx { query: p.q, userId, limit: p.size, offset: p.offset }
    let ids = A.mapMaybe (F.readStringAt "upload.id") hits
    if A.null hits then pure [] else do
      rows <- run ctx.db (base # where_ (SQL.and (owned userId) (SQL.inArray (toSQL T.userUploadsC.id) (map SQL.string ids)))) :: Aff (Array {})
      let byId = Map.fromFoldable (A.mapMaybe (\r -> (\id -> Tuple id (F.toForeign r)) <$> F.readStringAt "upload.id" (F.toForeign r)) rows)
      pure (A.mapMaybe (flip Map.lookup byId) ids)
  else do
    let filter = albumFilter p
    let condition = case filter of
          Nothing -> owned userId
          Just extra -> SQL.and (owned userId) extra
    let order = (if isJust filter then [SQL.asc (toSQL T.tracksC.trackNumber)] else []) <> [SQL.asc (toSQL T.tracksC.title), SQL.asc (toSQL T.tracksC.artist)]
    map F.toForeign <$> (run ctx.db (base # where_ condition # orderBy order # limitNumber p.size # offsetNumber p.offset) :: Aff (Array {}))

listAlbums :: Context -> String -> Listing -> Aff (Array Foreign)
listAlbums ctx userId p = do
  let condition = if p.q == "" then owned userId else SQL.and (owned userId)
        (SQL.template ["(lower(", ") like ", " or lower(", ") like ", ")"] [toSQL T.tracksC.album, SQL.string ("%" <> S.toLower p.q <> "%"), toSQL T.tracksC.albumArtist, SQL.string ("%" <> S.toLower p.q <> "%")])
  map F.toForeign <$> (run ctx.db (selectFieldsFrom
    { albumArtist: T.tracksC.albumArtist, album: T.tracksC.album
    , albumArt: SQL.template ["max(", ")"] [toSQL T.tracksC.albumArt]
    , albumUri: SQL.template ["max(", ")"] [toSQL T.tracksC.albumUri]
    , artistUri: SQL.template ["max(", ")"] [toSQL T.tracksC.artistUri]
    , trackCount: SQL.template ["count(distinct ", ")::int"] [toSQL T.userUploadsC.id] } T.userUploads
    # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id)) # where_ condition
    # groupBy [toSQL T.tracksC.albumArtist, toSQL T.tracksC.album] # orderBy [SQL.asc (toSQL T.tracksC.album), SQL.asc (toSQL T.tracksC.albumArtist)]
    # limitNumber p.size # offsetNumber p.offset) :: Aff (Array {}))

listArtists :: Context -> String -> Listing -> Aff (Array Foreign)
listArtists ctx userId p = do
  let condition = if p.q == "" then owned userId else SQL.and (owned userId)
        (SQL.template ["lower(", ") like ", ""] [toSQL T.tracksC.albumArtist, SQL.string ("%" <> S.toLower p.q <> "%")])
  map F.toForeign <$> (run ctx.db (selectFieldsFrom
    { name: T.tracksC.albumArtist, artistUri: SQL.template ["max(", ")"] [toSQL T.tracksC.artistUri]
    , trackCount: SQL.template ["count(distinct ", ")::int"] [toSQL T.userUploadsC.id]
    , albumCount: SQL.template ["count(distinct ", ")::int"] [toSQL T.tracksC.album] } T.userUploads
    # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id)) # where_ condition
    # groupBy [toSQL T.tracksC.albumArtist] # orderBy [SQL.asc (toSQL T.tracksC.albumArtist)]
    # limitNumber p.size # offsetNumber p.offset) :: Aff (Array {}))

getQueue :: Context -> String -> Aff Foreign
getQueue ctx userId = do
  states <- run ctx.db (selectFrom T.uploadQueueState # where_ (SQL.eq (toSQL T.uploadQueueStateC.userId) (SQL.string userId)) # limit 1) :: Aff (Array { uploadIds :: String, currentIndex :: Number })
  case A.head states of
    Nothing -> pure empty
    Just state -> do
      parsed <- case F.parseJson state.uploadIds of
        Left e -> throwError (error e)
        Right value -> pure value
      let ids = F.unsafeFromForeign parsed :: Array String
      if A.null ids then pure empty else do
        rows <- run ctx.db (selectFieldsFrom
          { uploadId: T.userUploadsC.id, title: T.tracksC.title, artist: T.tracksC.artist, albumArtist: T.tracksC.albumArtist, album: T.tracksC.album, albumArt: T.tracksC.albumArt, duration: T.tracksC.duration, sha256: T.tracksC.sha256, songUri: T.tracksC.uri } T.userUploads
          # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id))
          # where_ (SQL.and (SQL.inArray (toSQL T.userUploadsC.id) (map SQL.string ids)) (owned userId))) :: Aff (Array { uploadId :: String, songUri :: Nullable String })
        let byId = Map.fromFoldable (map (\r -> Tuple r.uploadId (F.mergeForeign (F.toForeign r) (F.toForeign { songUri: fromMaybe "" (toMaybe r.songUri) }))) rows)
        pure (F.toForeign { queue: A.mapMaybe (flip Map.lookup byId) ids, currentIndex: state.currentIndex })
  where
  empty = F.toForeign { queue: [] :: Array Foreign, currentIndex: 0 }

putQueue :: Context -> String -> Foreign -> Aff Boolean
putQueue ctx userId body = case F.readArrayAt "uploadIds" body, F.readNumberAt "currentIndex" body of
  Just ids, Just currentIndex -> do
    updatedAt <- liftEffect Date.now
    let uploadIds = F.stringify (F.toForeign ids)
    runInsert ctx.db (insertForeign T.uploadQueueState [F.toForeign { userId, uploadIds, currentIndex }]
      # onConflictDoUpdate { target: [toSQL T.uploadQueueStateC.userId], set: { uploadIds, currentIndex, updatedAt }, where_: Nothing })
    pure true
  _, _ -> pure false

register :: Context -> Hono.App -> Effect Unit
register ctx a = do
  Hono.get a "/" \c -> Rest.withUser ctx c \user -> listUploads ctx user.id (listing c) >>= Rest.json c 200 <<< F.toForeign
  Hono.get a "/albums" \c -> Rest.withUser ctx c \user -> listAlbums ctx user.id (listing c) >>= Rest.json c 200 <<< F.toForeign
  Hono.get a "/artists" \c -> Rest.withUser ctx c \user -> listArtists ctx user.id (listing c) >>= Rest.json c 200 <<< F.toForeign
  Hono.get a "/count" \c -> Rest.resolveUser ctx c >>= case _ of
    Nothing -> Rest.json c 401 (F.toForeign { error: "Unauthorized" })
    Just user -> do
      rows <- run ctx.db (selectFieldsFrom { total: SQL.raw "count(*)::int" } T.userUploads # where_ (owned user.id)) :: Aff (Array { total :: Int })
      result <- Rest.firstRow rows
      Rest.json c 200 (F.toForeign result)
  Hono.get a "/queue" \c -> Rest.withUser ctx c \user -> getQueue ctx user.id >>= Rest.json c 200
  Hono.put a "/queue" \c -> Rest.withUser ctx c \user -> do
    body <- Hono.reqJson c
    ok <- putQueue ctx user.id body
    if ok then Rest.json c 200 (F.toForeign { status: "ok" }) else Rest.text c 400 "Invalid body"
  Hono.delete a "/album" \c -> Rest.withUser ctx c \user -> case albumFilter (listing c) of
    Nothing -> Rest.json c 400 (F.toForeign { error: "MISSING_ALBUM", message: "albumUri or albumArtist + albumName is required" })
    Just filter -> do
      rows <- run ctx.db (selectFieldsFrom { upload: tableSQL T.userUploads } T.userUploads
        # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id)) # where_ (SQL.and (owned user.id) filter)) :: Aff (Array { upload :: SelectUserUpload })
      deleted <- if A.null rows then pure 0 else purgeUploads ctx user.id (map _.upload rows)
      Rest.json c 200 (F.toForeign { status: "ok", deleted })
  Hono.delete a "/by-album/:albumId" \c -> Rest.withUser ctx c \user -> do
    rows <- run ctx.db (selectFieldsFrom { upload: tableSQL T.userUploads } T.userUploads
      # innerJoin T.albumTracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.userUploadsC.trackId))
      # where_ (SQL.and (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string (Hono.reqParam c "albumId"))) (owned user.id))) :: Aff (Array { upload :: SelectUserUpload })
    deleted <- if A.null rows then pure 0 else purgeUploads ctx user.id (map _.upload rows)
    Rest.json c 200 (F.toForeign { status: "ok", deleted })
  let remove byTrack c = Rest.withUser ctx c \user -> do
        rows <- run ctx.db (selectFrom T.userUploads # where_ (SQL.and (owned user.id)
          (SQL.eq (if byTrack then toSQL T.userUploadsC.trackId else toSQL T.userUploadsC.id) (SQL.string (Hono.reqParam c (if byTrack then "trackId" else "id"))))) # limit 1) :: Aff (Array SelectUserUpload)
        case A.head rows of
          Nothing -> Rest.text c 404 "Upload not found"
          Just upload -> do
            void (purgeUploads ctx user.id [upload])
            Rest.json c 200 (F.toForeign { status: "ok" })
  Hono.delete a "/by-track/:trackId" (remove true)
  Hono.delete a "/:id" (remove false)
