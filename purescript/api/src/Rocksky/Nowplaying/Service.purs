module Rocksky.Nowplaying.Service
  ( scrobbleTrack, ImportCache, newImportCache, Submission
  , module Records, module Publication
  ) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Data.Array (head)
import Data.Either (Either(..))
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust, isNothing)
import Data.Nullable (Nullable, notNull, null, toMaybe, toNullable)
import Data.Number as Number
import Data.String (toLower)
import Dayjs as Dayjs
import Drizzle.Builder (innerJoin, limit, orderBy, run, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.Schema (Table, toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, Fiber, attempt, error, forkAff, joinFiber, throwError)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Nats (publishString)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith, sleep)
import Rocksky.Lib.DurableRecord (findDurableRecord)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Matching (matchingRequest, matchTrack)
import Rocksky.Lib.RecordOwnership (ownsRecord, putRecordOnce)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Lib.ScrobbleDedup (reserveScrobble)
import Rocksky.Lib.ScrobbleGuard (assertNotBotFlagged, assertNotScrobbleBlocked, recordScrobbleAndGuard)
import Rocksky.Nowplaying.Enrichment as Enrichment
import Rocksky.Nowplaying.Publication (findScrobble, publishScrobble) as Publication
import Rocksky.Nowplaying.Records (putArtistRecord, putAlbumRecord, putSongRecord, putScrobbleRecord, trackLookupWhere, trackLookupOrder) as Records
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Tealfm.Index as Teal
import Rocksky.Types.Track (Track)

type ImportCache =
  { artistOps :: Ref.Ref (Map.Map String (Fiber (Nullable String)))
  , albumOps :: Ref.Ref (Map.Map String (Fiber (Nullable String))) }

newImportCache :: Effect ImportCache
newImportCache = { artistOps: _, albumOps: _ } <$> Ref.new Map.empty <*> Ref.new Map.empty

type Submission = { id :: String, rkey :: String, skipTeal :: Boolean }

cachedPut :: Ref.Ref (Map.Map String (Fiber (Nullable String))) -> String -> Aff (Nullable String) -> Aff Unit
cachedPut cache key action = do
  existing <- liftEffect (Map.lookup key <$> Ref.read cache)
  task <- case existing of
    Just task -> pure task
    Nothing -> do
      task <- forkAff action
      liftEffect (Ref.modify_ (Map.insert key task) cache)
      pure task
  void (joinFiber task)

findRow :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe (Record r))
findRow ctx table condition = head <$> run ctx.db (selectFrom table # where_ condition # limit 1)

lookupTrack :: Context -> Track -> Aff (Maybe SelectTrack)
lookupTrack ctx track = head <$> run ctx.db (selectFrom T.tracks # where_ (Records.trackLookupWhere track) # orderBy [Records.trackLookupOrder track] # limit 1)

albumHash :: Track -> String
albumHash track = sha256Hex (toLower (track.album <> " - " <> track.albumArtist))

artistHash :: Track -> String
artistHash track = sha256Hex (toLower track.albumArtist)

repairAlbum :: Context -> Track -> SelectTrack -> Boolean -> Aff Unit
repairAlbum ctx track existing repairAlbumArtist = unless (Enrichment.present existing.albumUri) do
  album :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string (albumHash track)))
  case album of
    Nothing -> pure unit
    Just a -> do
      runUpdate ctx.db (update T.tracks { albumUri: a.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))
      when (repairAlbumArtist && not (Enrichment.present a.artistUri) && Enrichment.present existing.artistUri) $
        runUpdate ctx.db (update T.albums { artistUri: existing.artistUri } # where_ (SQL.eq (toSQL T.albumsC.id) (SQL.string a.id)))

repairArtist :: Context -> Track -> SelectTrack -> Aff Unit
repairArtist ctx track existing = unless (Enrichment.present existing.artistUri) do
  artist :: Maybe SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (SQL.string (artistHash track)))
  case artist of
    Nothing -> pure unit
    Just a -> runUpdate ctx.db (update T.tracks { artistUri: a.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))

scrobbleTrack :: Context -> Track -> Api.Agent -> String -> Boolean -> Maybe ImportCache -> Maybe Submission -> Aff Unit
scrobbleTrack ctx original agent userDid skipDupCheck importCache submission = do
  recovered <- case submission of
    Nothing -> pure false
    Just job -> isJust <$> findDurableRecord (Api.getRecord agent { repo: userDid, collection: "app.rocksky.scrobble", rkey: job.rkey })
  unless recovered do
    timestamp <- case toMaybe original.timestamp of
      Just n | n /= 0.0 -> pure n
      _ -> liftEffect (Dayjs.toUnix <$> Dayjs.now)
    let track = original { timestamp = notNull timestamp }
    let scrobbleTime = Dayjs.unix timestamp
    let window = if skipDupCheck then 0 else 60
    let existingScrobble = do
          rows :: Array { id :: String } <- run ctx.db
            (selectFieldsFrom { id: toSQL T.scrobblesC.id } T.scrobbles
              # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
              # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
              # where_ (SQL.and (SQL.eq (toSQL T.usersC.did) (SQL.string userDid))
                  (SQL.and (SQL.eq (SQL.template ["lower(", ")"] [toSQL T.tracksC.title]) (SQL.string (toLower track.title)))
                    (SQL.and (SQL.eq (SQL.template ["lower(", ")"] [toSQL T.tracksC.artist]) (SQL.string (toLower track.artist)))
                      (SQL.and (SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.param (Dayjs.toDate (Dayjs.subtract scrobbleTime window Dayjs.Second))))
                        (SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.param (Dayjs.toDate (Dayjs.add scrobbleTime window Dayjs.Second))))))))
              # limit 1)
          pure (isJust (head rows))
    duplicate <- if skipDupCheck then pure false else do
      assertNotBotFlagged ctx userDid
      assertNotScrobbleBlocked ctx userDid
      existingScrobble
    if duplicate then liftEffect (Log.info ("Scrobble already exists for " <> track.title))
    else do
      unless skipDupCheck (recordScrobbleAndGuard ctx userDid (Dayjs.toUnix scrobbleTime) (_.id <$> submission))
      persist track scrobbleTime window existingScrobble
  where
  persist input scrobbleTime window existingScrobble = do
    initial <- lookupTrack ctx input
    case initial of
      Nothing -> pure unit
      Just t -> repairAlbum ctx input t false *> repairArtist ctx input t
    userTracks :: Array { uri :: Nullable String } <- run ctx.db
      (selectFieldsFrom { uri: toSQL T.userTracksC.uri } T.userTracks
        # innerJoin T.tracks (SQL.eq (toSQL T.userTracksC.trackId) (toSQL T.tracksC.id))
        # innerJoin T.users (SQL.eq (toSQL T.userTracksC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.tracksC.id) (SQL.string (fromMaybe "" (_.id <$> initial)))) (SQL.eq (toSQL T.usersC.did) (SQL.string userDid))) # limit 1)
    matched <- attempt do
      request <- matchingRequest (toForeign input)
      candidate <- matchTrack ctx request null
      case toMaybe candidate of
        Nothing -> pure { track: input, mbTrack: Nothing, catalogId: Nothing }
        Just c -> Enrichment.enrich input c
    enriched <- case matched of
      Right result -> pure result
      Left e -> do
        liftEffect (Log.warnF "Matching unavailable; preserving submitted scrobble metadata" [toForeign e])
        pure { track: input, mbTrack: Nothing, catalogId: Nothing }
    let track = enriched.track { duration = if enriched.track.duration <= 0.0 then 1.0 else enriched.track.duration }
    let songSha = sha256Hex (toLower (track.title <> " - " <> track.artist <> " - " <> track.album))
    let artistSha = artistHash track
    let albumSha = albumHash track
    let userTrackUri = toNullable (head userTracks >>= toMaybe <<< _.uri)
    if not (ownsRecord userTrackUri userDid) then void $
      putRecordOnce ctx.redis userDid "app.rocksky.song" songSha (toMaybe <$> Records.putSongRecord ctx track agent)
    else case initial of
      Just t | not (Enrichment.present t.uri) -> recoverWith unit $
        runUpdate ctx.db (update T.tracks { uri: userTrackUri } # where_ (SQL.and (SQL.eq (toSQL T.tracksC.id) (SQL.string t.id)) (SQL.isNull (toSQL T.tracksC.uri))))
      _ -> pure unit
    album :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumSha))
    void (waitTrack track initial 0)
    userArtist :: Array { uri :: Nullable String } <- run ctx.db
      (selectFieldsFrom { uri: toSQL T.userArtistsC.uri } T.userArtists
        # innerJoin T.artists (SQL.eq (toSQL T.userArtistsC.artistId) (toSQL T.artistsC.id))
        # innerJoin T.users (SQL.eq (toSQL T.userArtistsC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistSha)) (SQL.eq (toSQL T.usersC.did) (SQL.string userDid))) # limit 1)
    unless (ownsRecord (toNullable (head userArtist >>= toMaybe <<< _.uri)) userDid) $ case importCache of
      Just cache -> cachedPut cache.artistOps artistSha (Records.putArtistRecord ctx track agent)
      Nothing -> void (putRecordOnce ctx.redis userDid "app.rocksky.artist" artistSha (toMaybe <$> Records.putArtistRecord ctx track agent))
    userAlbum :: Array { uri :: Nullable String } <- run ctx.db
      (selectFieldsFrom { uri: toSQL T.userAlbumsC.uri } T.userAlbums
        # innerJoin T.albums (SQL.eq (toSQL T.userAlbumsC.albumId) (toSQL T.albumsC.id))
        # innerJoin T.users (SQL.eq (toSQL T.userAlbumsC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumSha)) (SQL.eq (toSQL T.usersC.did) (SQL.string userDid))) # limit 1)
    let withArt = case album of
          Just a | not (Enrichment.present track.albumArt) -> track { albumArt = a.albumArt }
          _ -> track
    unless (ownsRecord (toNullable (head userAlbum >>= toMaybe <<< _.uri)) userDid) $ case importCache of
      Just cache -> cachedPut cache.albumOps albumSha (Records.putAlbumRecord ctx withArt agent)
      Nothing -> void (putRecordOnce ctx.redis userDid "app.rocksky.album" albumSha (toMaybe <$> Records.putAlbumRecord ctx withArt agent))
    current <- lookupTrack ctx withArt >>= \row -> waitUris withArt row 0
    case enriched.mbTrack of
      Just mb | presentMb mb.trackMBID && not (fromMaybe false (_.skipTeal <$> submission)) -> do
        timestamp <- case toMaybe withArt.timestamp of
          Just n | n /= 0.0 -> case Dayjs.toISOString (Dayjs.unix n) of
            Just iso -> pure iso
            Nothing -> throwError (error "Invalid time value")
          _ -> nowIso
        Teal.publishPlayingNow ctx agent (mb { timestamp = timestamp }) (Number.floor (withArt.duration / 1000.0)) (_.id <$> submission)
      _ -> pure unit
    let catalogTrack = case current of
          Just t | Just t.id == enriched.catalogId -> Enrichment.catalogMetadata withArt t
          _ -> withArt
    finalTrack <- case album of
      Just a -> Enrichment.albumMetadata catalogTrack a
      Nothing -> pure catalogTrack
    duplicate <- existingScrobble
    unless duplicate do
      reserved <- reserveScrobble ctx.redis userDid { title: finalTrack.title, artist: finalTrack.artist, timestamp: Dayjs.toUnix scrobbleTime } window (_.id <$> submission)
      if not reserved then case submission of
        Just _ -> throwError (error "Another submission holds the dedup reservation; retry after it completes or expires")
        Nothing -> liftEffect (Log.info ("Concurrent duplicate scrobble skipped for " <> finalTrack.title))
      else do
        uri <- Records.putScrobbleRecord ctx finalTrack agent (_.rkey <$> submission)
        unless (Enrichment.present uri) (throwError (error "Failed to publish scrobble record"))
        when (isNothing submission) do
          hydrate (fromMaybe "" (toMaybe uri)) 0 Nothing
          liftEffect (publishString ctx.nc "rocksky.user.scrobble.sync" userDid)
  presentMb s = s /= ""
  waitTrack track current tries
    | isJust current || tries >= 30 = pure current
    | otherwise = do
        liftEffect (Log.info ("Song not found, trying again: " <> show (tries + 1)))
        next <- lookupTrack ctx track
        sleep 1000
        waitTrack track next (tries + 1)
  waitUris track current tries
    | tries >= 30 || fromMaybe false (map (\t -> Enrichment.present t.artistUri || Enrichment.present t.albumUri) current) = pure current
    | otherwise = do
        liftEffect (Log.info ("Artist uri not ready, trying again: " <> show (tries + 1)))
        next <- lookupTrack ctx track
        case next of
          Just t -> repairArtist ctx track t *> repairAlbum ctx track t true
          Nothing -> pure unit
        sleep 1000
        waitUris track next (tries + 1)
  hydrate uri tries prior
    | tries >= 30 || isJust prior = pure unit
    | otherwise = do
        first <- Publication.findScrobble ctx (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri))
        case first of
          Just row | not (Enrichment.present row.album.artistUri) && Enrichment.present row.artist.uri ->
            runUpdate ctx.db (update T.albums { artistUri: row.artist.uri } # where_ (SQL.eq (toSQL T.albumsC.id) (SQL.string row.album.id)))
          _ -> pure unit
        second <- Publication.findScrobble ctx (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri))
        case second of
          Just row | Enrichment.present row.album.artistUri && Enrichment.present row.track.artistUri && Enrichment.present row.track.albumUri ->
            Publication.publishScrobble ctx row.scrobble.id
          _ -> do
            liftEffect (Log.info ("Scrobble not found, trying again: " <> show (tries + 1)))
            sleep 1000
            hydrate uri (tries + 1) second
