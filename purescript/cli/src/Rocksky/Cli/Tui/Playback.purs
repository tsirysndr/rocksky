module Rocksky.Cli.Tui.Playback where

import Prelude
import Control.Parallel (parTraverse_)
import Control.Promise (Promise, toAffE)
import Data.Array as Array
import Data.Foldable (for_)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Set as Set
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Aff (Aff, finally, try)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Tui.Library as Library
import Rocksky.Lib.Foreign as F

foreign import isCached :: Foreign -> Effect Boolean
foreign import cachePath :: Foreign -> String
foreign import cacheId :: Foreign -> String
foreign import cacheTrackImpl :: String -> Foreign -> Effect (Promise String)
foreign import getCredsImpl :: String -> Effect (Promise (Nullable Library.Credentials))
foreign import callImpl :: String -> Array Foreign -> Effect (Promise Unit)
foreign import status :: Effect Foreign
foreign import queue :: Effect (Array Foreign)
foreign import restored :: Effect (Nullable { items :: Array Foreign, index :: Int, positionMs :: Number })
foreign import clearRestored :: Effect Unit
foreign import sameItem :: Foreign -> Foreign -> Boolean

type Playable = { items :: Array Foreign, uris :: Array String }

playable :: String -> Array Foreign -> Aff Playable
playable token tracks = do
  candidates <- traverse
    ( \item -> do
        cached <- liftEffect (isCached item)
        pure { item, cached }
    )
    tracks
  streamToken <-
    if Array.any (\t -> not t.cached && Client.field "uploadId" t.item /= "") candidates then
      Client.field "token" <$> Client.getStreamToken (Client.new token)
    else pure ""
  creds <-
    if Array.any (\t -> not t.cached && Client.field "uploadId" t.item == "" && Client.field "trackId" t.item /= "") candidates then do
      result <- try (toAffE (getCredsImpl token))
      pure $ case result of
        Left _ -> Nothing
        Right value -> toMaybe value
    else pure Nothing
  let
    choose { item, cached } =
      let
        uploadId = Client.field "uploadId" item
        trackId = Client.field "trackId" item
        uri =
          if cached then cachePath item
          else if uploadId /= "" then Client.streamUrl uploadId streamToken
          else if trackId /= "" then fromMaybe "" (creds <#> \c -> Library.streamUrl c trackId)
          else ""
      in
        if uri == "" then Nothing else Just { item, uri }
    selected = Array.mapMaybe choose candidates
  pure { items: map _.item selected, uris: map _.uri selected }

native :: String -> Array Foreign -> Aff Unit
native name args = toAffE (callImpl name args)

playQueue :: Playable -> Int -> Aff Unit
playQueue selected index = native "playQueue" [ F.toForeign selected.items, F.toForeign selected.uris, F.toForeign index ]

streamAndPlay :: String -> Array Foreign -> Int -> Aff Unit
streamAndPlay token tracks index = unless (Array.null tracks) do
  selected <- playable token tracks
  unless (Array.null selected.items) do
    let
      start = fromMaybe 0 do
        item <- Array.index tracks index
        Array.findIndex (sameItem item) selected.items
    playQueue selected start

enqueue :: String -> String -> Array Foreign -> Int -> Aff Unit
enqueue method token tracks position = unless (Array.null tracks) do
  parTraverse_ (\item -> void $ try $ toAffE (cacheTrackImpl token item)) tracks
  selected <- playable token tracks
  unless (Array.null selected.items) $ native method [ F.toForeign selected.items, F.toForeign selected.uris, F.toForeign position ]

rotate :: forall a. Int -> Array a -> Array a
rotate n items = Array.drop n items <> Array.take n items

resumeSession :: String -> Aff Unit
resumeSession token = do
  previous <- liftEffect restored
  for_ (toMaybe previous) \session -> do
    let items = rotate session.index session.items
    selected <- playable token items
    unless (Array.null selected.items) do
      playQueue selected 0
      case Array.head selected.items, Array.head items of
        Just current, Just expected | session.positionMs > 0.0 && sameItem current expected -> do
          cached <- liftEffect (isCached current)
          when cached $ native "seekMs" [ F.toForeign session.positionMs ]
        _, _ -> pure unit
      liftEffect clearRestored

jumpTo :: String -> Int -> Aff Unit
jumpTo token index = do
  items <- liftEffect queue
  when (index >= 0 && index < Array.length items) do
    selected <- playable token (rotate index items)
    unless (Array.null selected.items) $ playQueue selected 0

skip :: Int -> String -> Aff Unit
skip delta token = do
  current <- liftEffect status
  items <- liftEffect queue
  for_ (F.readIntAt "index" current) \index -> do
    let target = index + delta
    if target >= 0 && target < Array.length items then jumpTo token target
    else when (Client.field "repeat" current == "all") $ jumpTo token (if delta > 0 then 0 else Array.length items - 1)

prefetching :: Ref.Ref (Set.Set String)
prefetching = unsafePerformEffect (Ref.new Set.empty)

isPrefetching :: Effect Boolean
isPrefetching = not <<< Set.isEmpty <$> Ref.read prefetching

prefetchTick :: String -> Aff Unit
prefetchTick token = unless (token == "") do
  current <- liftEffect status
  items <- liftEffect queue
  for_ (F.readIntAt "index" current) \index -> do
    let
      duration = fromMaybe 0.0 do
        case F.readNumberAt "duration_ms" current of
          Just value | value /= 0.0 -> Just value
          _ -> Array.index items index >>= F.readNumberAt "duration"
      position = fromMaybe 0.0 (F.readNumberAt "position_ms" current)
      halfway = if duration > 0.0 then position >= duration / 2.0 else position >= 15000.0
    when (Client.field "state" current == "playing" && halfway && index + 1 < fromMaybe 0 (F.readIntAt "queue_len" current)) do
      for_ (Array.index items (index + 1)) \item -> do
        let id = cacheId item
        unless (id == "") do
          cached <- liftEffect (isCached item)
          if cached then native "swapQueueToLocal" [ F.toForeign (index + 1), F.toForeign (cachePath item) ]
          else do
            active <- liftEffect $ Ref.read prefetching
            unless (Set.member id active) do
              liftEffect $ Ref.modify_ (Set.insert id) prefetching
              finally (liftEffect $ Ref.modify_ (Set.delete id) prefetching) $ void $ try do
                path <- toAffE (cacheTrackImpl token item)
                native "swapQueueToLocal" [ F.toForeign (index + 1), F.toForeign path ]
