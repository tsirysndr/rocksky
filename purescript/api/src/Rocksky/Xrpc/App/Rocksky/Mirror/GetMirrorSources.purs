module Rocksky.Xrpc.App.Rocksky.Mirror.GetMirrorSources (register, providers, present, emptySources) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Array (find, head)
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (null, toMaybe, toNullable)
import Data.Traversable (traverse)
import Drizzle.Builder (limit, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (omitNulls, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.MirrorSources (SelectMirrorSource)
import Rocksky.Tealfm.PushEnabled (resolvePushEnabled)
import Rocksky.Xrpc.Util (authDid)

providers :: Array String
providers = [ "lastfm", "listenbrainz", "tealfm" ]

emptySources :: Foreign
emptySources = toForeign { sources: map (\provider -> { provider, enabled: false, pushEnabled: true, hasCredentials: false }) providers }

present :: Maybe String -> String -> Maybe SelectMirrorSource -> Aff Foreign
present did provider row = do
  lastPolledAt <- liftEffect (traverse toISOString (row >>= toMaybe <<< _.lastPolledAt))
  lastScrobbleSeenAt <- liftEffect (traverse toISOString (row >>= toMaybe <<< _.lastScrobbleSeenAt))
  pure $ omitNulls $ toForeign
    { provider
    , enabled: fromMaybe false (_.enabled <$> row)
    , pushEnabled: resolvePushEnabled (fromMaybe null (_.pushEnabled <$> row)) did
    , externalUsername: toNullable (row >>= toMaybe <<< _.externalUsername)
    , hasCredentials: fromMaybe "" (row >>= toMaybe <<< _.encryptedApiKey) /= ""
    , lastPolledAt: toNullable lastPolledAt
    , lastScrobbleSeenAt: toNullable lastScrobbleSeenAt
    }

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.mirror.getMirrorSources"
  { auth: Just ctx.authVerifier
  , handler: \input -> Json <$> recoverWith emptySources
      ( timeoutMs 10000 $ retryTransientDb do
          let did = authDid input
          rows <- case did of
            Nothing -> pure []
            Just id -> do
              users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string id)) # limit 1)
              case head users of
                Nothing -> pure []
                Just user -> run ctx.db (selectFrom T.mirrorSources # where_ (SQL.eq (toSQL T.mirrorSourcesC.userId) (SQL.string user.id)))
          sources <- traverse (\provider -> present did provider (find (\row -> row.provider == provider) rows)) providers
          pure (toForeign { sources })
      )
  }
