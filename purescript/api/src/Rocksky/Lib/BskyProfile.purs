-- | Resolve a user's avatar + displayName (`src/lib/bskyProfile.ts`),
-- | preferring the Bluesky public AppView (globally reachable, never blocks
-- | our egress) and falling back to the profile record on the user's PDS.
module Rocksky.Lib.BskyProfile (ResolvedBskyProfile, fetchBskyProfile) where

import Prelude

import Atproto.Api (Agent)
import Atproto.Api as Api
import Consola as Consola
import Data.Array (index)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.String (Pattern(..), split)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Effect.Unsafe (unsafePerformEffect)
import Node.Process (lookupEnv)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign (path, readStringAt)

-- | A field is `Nothing` when neither the AppView nor the PDS provided it, so
-- | callers can preserve existing good data instead of overwriting it.
type ResolvedBskyProfile = { avatar :: Maybe String, displayName :: Maybe String }

-- Shared, unauthenticated client for the Bluesky public AppView.
appViewAgent :: Agent
appViewAgent = unsafePerformEffect do
  url <- lookupEnv "BSKY_APPVIEW_URL"
  Api.newAtpAgent (fromMaybe "https://public.api.bsky.app" (url >>= \u -> if u == "" then Nothing else Just u))

nonEmpty :: Maybe String -> Maybe String
nonEmpty = case _ of
  Just "" -> Nothing
  other -> other

fetchBskyProfile :: Maybe String -> Maybe Agent -> Aff ResolvedBskyProfile
fetchBskyProfile mdid agent = case mdid of
  Nothing -> pure empty
  Just did -> do
    primary <- attempt (Api.getBskyProfile appViewAgent did)
    case primary of
      Right p -> pure { avatar: nonEmpty (toMaybe p.avatar), displayName: nonEmpty (toMaybe p.displayName) }
      Left e -> do
        liftEffect $ Consola.warnF ("AppView getProfile failed for " <> did <> "; falling back to PDS:") [ errorToForeign e ]
        -- Only succeeds when our egress can actually reach the PDS.
        case agent of
          Nothing -> pure empty
          Just a -> do
            fallback <- attempt (Api.getRecord a { repo: did, collection: "app.bsky.actor.profile", rkey: "self" })
            case fallback of
              Left err -> do
                liftEffect $ Consola.errorF ("Failed to read profile record from PDS for " <> did <> ":") [ errorToForeign err ]
                pure empty
              Right out -> do
                let
                  cid = fromMaybe "" (map stringifyRef (path "value.avatar.ref" out.value))
                  ext = fromMaybe "jpeg" (readStringAt "value.avatar.mimeType" out.value >>= \m -> index (split (Pattern "/") m) 1 >>= \x -> if x == "" then Nothing else Just x)
                pure
                  { avatar: if cid == "" then Nothing else Just ("https://cdn.bsky.app/img/avatar/plain/" <> did <> "/" <> cid <> "@" <> ext)
                  , displayName: nonEmpty (readStringAt "value.displayName" out.value)
                  }
  where
  empty = { avatar: Nothing, displayName: Nothing }
  -- A CID ref serialises to its string form via toString(); JSON gives {"$link": cid}.
  stringifyRef ref = fromMaybe (refToString ref) (readStringAt "$link" ref)

foreign import refToString :: forall a. a -> String
