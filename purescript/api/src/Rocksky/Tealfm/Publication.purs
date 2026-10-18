module Rocksky.Tealfm.Publication (tealRecord, publishTealRecord, publishTealStatus) where

import Prelude
import Atproto.Api as Api
import Atproto.Lexicon as Lexicon
import Control.Parallel (parTraverse)
import Data.Array (any, concat)
import Data.Either (Either(..))
import Data.JSDate (fromTime, getTime, now, parse, toISOString)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (null, toMaybe, toNullable)
import Data.Number (abs, isFinite, nan)
import Data.String (Pattern(..), stripPrefix)
import Data.Traversable (traverse)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.DurableRecord (findDurableRecord, publishDurableRecord)
import Rocksky.Lib.Foreign (mergeForeign, omitNulls, readNumberAt, readStringAt, toForeign)
import Rocksky.Types.Track (MusicbrainzTrack)

playCollection :: String
playCollection = "fm.teal.feed.play"

statusCollection :: String
statusCollection = "fm.teal.actor.status"

toMbidUri :: String -> Maybe String
toMbidUri "" = Nothing
toMbidUri value = Just (if isJust (stripPrefix (Pattern "mbid:") value) then value else "mbid:" <> value)

tealRecord :: Context -> MusicbrainzTrack -> Number -> Aff Foreign
tealRecord ctx track duration = do
  let
    record = omitNulls
      ( toForeign
          { "$type": playCollection
          , duration
          , trackName: track.name
          , playedTime: track.timestamp
          , artists: map (\artist -> omitNulls (toForeign { artistName: artist.name, artistMbId: toNullable (toMbidUri artist.mbid) })) track.artist
          , releaseMbId: toNullable (toMbidUri track.releaseMBID)
          , releaseName: track.album
          , recordingMbId: toNullable (toMbidUri track.trackMBID)
          , submissionClientAgent: "rocksky/v0.0.1"
          }
      )
  case Lexicon.validateRecord ctx.lexicons playCollection record of
    Left _ -> throwError (error "Invalid Teal record")
    Right _ -> pure record

parsedTime :: String -> Foreign -> Aff Number
parsedTime key record = liftEffect (getTime <$> parse (fromMaybe "" (readStringAt key record)))

publishTealRecord :: Api.Agent -> Foreign -> String -> Maybe Number -> Aff Unit
publishTealRecord agent record rkey currentTime = do
  time <- parsedTime "playedTime" record
  unless (isFinite time) (throwError (error "Invalid Teal listening time"))
  repo <- liftEffect (Api.assertDid agent)
  let lookup = Api.getRecord agent { repo, collection: playCollection, rkey }
  durable <- findDurableRecord lookup
  proceed <- case durable of
    Just _ -> pure true
    Nothing -> do
      pages <- parTraverse (\collection -> Api.listRecords agent { repo, collection, limit: 5, cursor: null }) [ "fm.teal.alpha.feed.play", playCollection ]
      duplicates <- traverse (duplicate time <<< _.value) (concat (map _.records pages))
      if any identity duplicates then pure false
      else do
        _ <- publishDurableRecord (Api.putRecord agent { repo, collection: playCollection, rkey, record, validate: false, swapRecord: Just Nothing }) lookup
        pure true
  when proceed (publishTealStatus agent record currentTime)
  where
  duplicate time play = do
    playedTime <- parsedTime "playedTime" play
    let
      sameMbid = case readStringAt "recordingMbId" record of
        Just mbid | mbid /= "" -> readStringAt "recordingMbId" play == Just mbid || readStringAt "recordingMbId" play == Just (fromMaybe mbid (stripPrefix (Pattern "mbid:") mbid))
        _ -> false
    let
      sameTitleDuration = readStringAt "trackName" play == readStringAt "trackName" record
        && abs (fromMaybe nan (readNumberAt "duration" play) - fromMaybe nan (readNumberAt "duration" record)) < 4.0
    pure ((sameMbid || sameTitleDuration) && abs (playedTime - time) < 60000.0)

publishTealStatus :: Api.Agent -> Foreign -> Maybe Number -> Aff Unit
publishTealStatus agent item currentTime = do
  time <- parsedTime "playedTime" item
  let expiry = time + 600000.0
  unless (isFinite time) (throwError (error "Invalid Teal listening time"))
  nowTime <- case currentTime of
    Just value -> pure value
    Nothing -> liftEffect (getTime <$> now)
  when (expiry > nowTime) do
    repo <- liftEffect (Api.assertDid agent)
    result <- attempt (Api.getRecord agent { repo, collection: statusCollection, rkey: "self" })
    decision <- case result of
      Left err
        | Api.xrpcErrorName err == Just "RecordNotFound" -> pure (Just Nothing)
        | otherwise -> throwError err
      Right current -> do
        existingTime <- parsedTime "time" current.value
        unless (isFinite existingTime) (throwError (error "Invalid existing Teal status time"))
        if existingTime >= time then pure Nothing
        else case toMaybe current.cid of
          Just cid | cid /= "" -> pure (Just (Just cid))
          _ -> throwError (error "Missing Teal status CID")
    case decision of
      Nothing -> pure unit
      Just swapRecord -> do
        timeString <- liftEffect (toISOString (fromTime time))
        expiryString <- liftEffect (toISOString (fromTime expiry))
        void $ Api.putRecord agent
          { repo
          , collection: statusCollection
          , rkey: "self"
          , swapRecord: Just swapRecord
          , validate: true
          , record: toForeign { "$type": statusCollection, item: mergeForeign item (toForeign { "$type": "fm.teal.feed.defs#playView" }), time: timeString, expiry: expiryString }
          }
