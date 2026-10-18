module Rocksky.Lib.DiscogsRelation where

import Prelude
import Control.Alt ((<|>))
import Data.Array (filter, foldl, index, length, mapWithIndex, null)
import Data.Array.NonEmpty as NE
import Data.Char (toCharCode)
import Data.Either (hush)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.Number as Number
import Data.String (Pattern(..), split, trim, toUpper)
import Data.String.CodeUnits as CU
import Data.String.Regex (match, regex)
import Data.String.Regex.Flags (noFlags)
import Foreign (Foreign)
import Rocksky.Lib.Discogs (DiscogsArtistCredit, DiscogsLabelRef, DiscogsIdentifier, DiscogsTracklistEntry, DiscogsMaster, DiscogsRelease)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Matching (matches)

trimmed :: Nullable String -> Nullable String
trimmed value = toNullable (toMaybe value >>= \s -> if trim s == "" then Nothing else Just (trim s))

clean :: String -> String
clean value = fromMaybe "" (toMaybe (trimmed (notNull value)))

nonzero :: Nullable Int -> Nullable Int
nonzero value = toNullable (toMaybe value >>= \n -> if n == 0 then Nothing else Just n)

nonemptyArray :: forall a. Nullable (Array a) -> Nullable (Array a)
nonemptyArray value = toNullable (toMaybe value >>= \a -> if null a then Nothing else Just a)

capture :: String -> Int -> String -> Maybe String
capture pattern index value = do
  re <- hush (regex pattern noFlags)
  groups <- match re value
  NE.index groups index >>= identity

parsePosition :: String -> Array Number
parsePosition value =
  let pos = trim value
      number s = fromMaybe 0.0 (Number.fromString s)
  in case capture "^([0-9]+)[-.]([0-9]+)" 1 pos, capture "^([0-9]+)[-.]([0-9]+)" 2 pos of
    Just disc, Just track -> [number disc, number track]
    _, _ -> case capture "^([A-Za-z])([0-9]+)" 1 pos, capture "^([A-Za-z])([0-9]+)" 2 pos of
      Just side, Just track ->
        let code = fromMaybe 65 (toCharCode <$> CU.charAt 0 (toUpper side))
        in [Number.floor (Int.toNumber (code - 65) / 2.0) + 1.0, number track]
      _, _ -> if matches "^[0-9]+$" pos then [0.0, number pos] else [0.0, 0.0]

durationNumber :: String -> Maybe Number
durationNumber raw
  | trim raw == "" = Just 0.0
  | matches "^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$" (trim raw) = Number.fromString raw
  | matches "^0[xX][a-fA-F0-9]+$" (trim raw) = Int.toNumber <$> Int.fromStringAs Int.hexadecimal (CU.drop 2 (trim raw))
  | matches "^0[bB][01]+$" (trim raw) = Int.toNumber <$> Int.fromStringAs Int.binary (CU.drop 2 (trim raw))
  | matches "^0[oO][0-7]+$" (trim raw) = Int.toNumber <$> Int.fromStringAs Int.octal (CU.drop 2 (trim raw))
  | otherwise = Nothing

parseDurationMs :: String -> Number
parseDurationMs duration =
  let parts = split (Pattern ":") (trim duration)
      step total part = do
        seconds <- total
        n <- durationNumber part
        if n < 0.0 || Number.floor n /= n then Nothing else Just (seconds * 60.0 + n)
  in if trim duration == "" || length parts > 3 then 0.0 else fromMaybe 0.0 (map (_ * 1000.0) (foldl step (Just 0.0) parts))

joinArtistCredits :: Array DiscogsArtistCredit -> String
joinArtistCredits artists = (foldl step { credit: "", previous: "" } selected).credit
  where
  name a = clean (case toMaybe a.anv of
    Just value | value /= "" -> value
    _ -> a.name)
  selected = filter (\a -> name a /= "") artists
  step acc a =
    { credit: if acc.credit == "" then name a else acc.credit <> (if acc.previous == "" || acc.previous == "," then ", " else " " <> acc.previous <> " ") <> name a
    , previous: fromMaybe "" (toMaybe (trimmed a.join)) }

toReleaseArtistRows :: String -> Array DiscogsArtistCredit -> Array Foreign
toReleaseArtistRows releaseId = mapWithIndex (\position a -> toForeign
  { releaseId, artistId: nonzero a.id, name: clean a.name, anv: trimmed a.anv, joinPhrase: trimmed a.join, role: trimmed a.role, position })
  <<< filter (\a -> clean a.name /= "")

toReleaseLabelRows :: String -> DiscogsRelease -> Array Foreign
toReleaseLabelRows releaseId release = rows "label" (fromMaybe [] (toMaybe release.labels)) <> rows "company" (fromMaybe [] (toMaybe release.companies))
  where
  rows :: String -> Array DiscogsLabelRef -> Array Foreign
  rows kind = mapWithIndex (\position entry -> toForeign
    { releaseId, labelId: nonzero entry.id, name: clean entry.name, catalogNumber: trimmed entry.catno, kind
    , entityType: toNullable (toMaybe (trimmed entry.entity_type_name) <|> toMaybe (trimmed entry.entity_type)), position })
    <<< filter (\entry -> clean entry.name /= "")

toIdentifierRows :: String -> Array DiscogsIdentifier -> Array Foreign
toIdentifierRows releaseId = mapWithIndex (\position entry -> toForeign
  { releaseId, type: clean entry.type, value: trimmed entry.value, description: trimmed entry.description, position })
  <<< filter (\entry -> clean entry.type /= "")

toTrackRows :: String -> Array DiscogsTracklistEntry -> Array Foreign
toTrackRows releaseId = mapWithIndex row <<< filter (\entry -> clean entry.title /= "")
  where
  row idx entry =
    let position = parsePosition (fromMaybe "" (toMaybe entry.position))
        positive n = toNullable (if n > 0.0 then Just n else Nothing)
    in toForeign
      { releaseId, position: trimmed entry.position, type: trimmed entry.type_, title: clean entry.title, duration: trimmed entry.duration
      , durationMs: positive (parseDurationMs (fromMaybe "" (toMaybe entry.duration)))
      , discNumber: positive (fromMaybe 0.0 (index position 0)), trackNumber: positive (fromMaybe 0.0 (index position 1)), idx }

toMasterRow :: DiscogsMaster -> Maybe Foreign
toMasterRow master
  | master.id == 0 || clean master.title == "" = Nothing
  | otherwise = Just $ toForeign
      { discogsId: master.id, title: clean master.title
      , artist: trimmed (toNullable (Just (joinArtistCredits (fromMaybe [] (toMaybe master.artists)))))
      , year: nonzero master.year, mainReleaseId: nonzero master.main_release, discogsUrl: trimmed master.uri
      , genres: nonemptyArray master.genres, styles: nonemptyArray master.styles }
