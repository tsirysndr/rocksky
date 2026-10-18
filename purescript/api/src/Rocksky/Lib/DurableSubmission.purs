-- | Hands scrobbles to the durable submissions queue (`src/lib/durableSubmission.ts`).
module Rocksky.Lib.DurableSubmission
  ( isSubmissionUnavailable
  , submissionUnavailable
  , validSubmissionSecret
  , submissionRecordKey
  , submissionInput
  , enqueueSubmission
  , enqueueTealSubmission
  ) where

import Prelude

import Data.Either (Either(..), hush)
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe, toNullable)
import Data.String (take, toLower)
import Data.String.CodeUnits (dropRight, takeRight)
import Data.Tuple (Tuple(..))
import Data.String as String
import Data.String.Regex (regex, test)
import Data.String.Regex.Flags (noFlags)
import Effect.Aff (Aff, Error, attempt, error, throwError)
import Effect.Class (liftEffect)
import Effect.Unsafe (unsafePerformEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Node.Crypto (randomUUID, sha256Hex, timingSafeEqualStrings)
import Rocksky.Lib.Error (errorName)
import Rocksky.Lib.Foreign (asString, mergeForeign, readStringAt, stringify, toForeign)
import Rocksky.Types.Track (Track)

foreign import mkNamedError :: String -> String -> Error

submissionUnavailable :: String -> Error
submissionUnavailable = mkNamedError "SubmissionUnavailable"

isSubmissionUnavailable :: Error -> Boolean
isSubmissionUnavailable e = errorName e == "SubmissionUnavailable"

validSubmissionSecret :: Maybe String -> String -> Boolean
validSubmissionSecret provided expected = case provided of
  Just p | p /= "" && String.length expected >= 32 -> timingSafeEqualStrings p expected
  _ -> false

-- | Generated once by Rust and saved with the job; respect the lexicon's TID key.
submissionRecordKey :: Foreign -> Either String String
submissionRecordKey key = case asString key of
  Just k | matches "^[234567ab][234567abcdefghijklmnopqrstuvwxyz]{12}$" k -> Right k
  _ -> Left "Invalid submission record key"

matches :: String -> String -> Boolean
matches pat s = case hush (regex pat noFlags) of
  Just re -> test re s
  Nothing -> false

-- | The transport schema accepts YYYY-MM-DD, whereas the parsed track carries a Date.
submissionInput :: String -> Track -> Maybe String -> Foreign
submissionInput did track explicitKey =
  let
    releaseDate = toNullable (map (\d -> take 10 (unsafePerformEffect (toISOString d))) (toMaybe track.releaseDate))
    payload = mergeForeign (toForeign track) (toForeign { releaseDate })
    key = case explicitKey of
      Just k | k /= "" -> k
      _ -> case toMaybe track.timestamp of
        Just ts -> sha256Hex (stringify (toForeign [ toForeign did, toForeign (toLower track.title), toForeign (toLower track.artist), toForeign (toLower track.album), toForeign ts ]))
        Nothing -> unsafePerformEffect randomUUID
  in
    toForeign { did, track: payload, idempotencyKey: key }

enqueueSubmission :: { url :: String, secret :: String } -> String -> Track -> Maybe String -> Boolean -> Aff String
enqueueSubmission config did track explicitKey skipTeal =
  enqueueDurable config "/v1/submissions" $
    if skipTeal then mergeForeign (submissionInput did track explicitKey) (toForeign { skipTeal: true })
    else submissionInput did track explicitKey

enqueueTealSubmission :: { url :: String, secret :: String } -> String -> Foreign -> String -> Aff String
enqueueTealSubmission config did record idempotencyKey =
  enqueueDurable config "/v1/tealfm" (toForeign { did, record, idempotencyKey })

enqueueDurable :: { url :: String, secret :: String } -> String -> Foreign -> Aff String
enqueueDurable config path input = do
  when (config.url == "" || String.length config.secret < 32) $
    throwError (submissionUnavailable "Durable submissions are not configured")
  r <- attempt do
    signal <- liftEffect (Fetch.timeoutSignal 15000)
    response <- Fetch.fetchWith (stripTrailing config.url <> path)
      Fetch.defaultOptions
        { method = "POST"
        , headers = Object.fromFoldable [ Tuple "content-type" "application/json", Tuple "x-rocksky-submissions-secret" config.secret ]
        , body = toNullable (Just (toForeign (stringify input)))
        , signal = toNullable (Just signal)
        , redirect = "error"
        }
    when (Fetch.status response /= 202) $ throwError (error ("Queue returned " <> show (Fetch.status response)))
    job <- Fetch.json response
    case readStringAt "id" job of
      Just id | matches "^[a-f0-9]{64}$" id -> pure id
      _ -> throwError (error "Invalid queue acknowledgement")
  case r of
    Right id -> pure id
    -- Never fall back to an in-memory pipeline, and never expose the secret.
    Left _ -> throwError (submissionUnavailable "Submission could not be durably accepted; retry with the same timestamp or Idempotency-Key")
  where
  stripTrailing u = if takeRight 1 u == "/" then dropRight 1 u else u
