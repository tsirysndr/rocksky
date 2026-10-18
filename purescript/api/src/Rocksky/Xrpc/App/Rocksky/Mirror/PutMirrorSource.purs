module Rocksky.Xrpc.App.Rocksky.Mirror.PutMirrorSource (register) where

import Prelude
import Control.Alt ((<|>))
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Array (elem, head)
import Data.JSDate (fromTime, getTime, now)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe, toNullable)
import Drizzle.Builder (insertForeign, limit, run, runInsertReturning, runUpdateReturning, selectFieldsFrom, selectFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (error, throwError)
import Effect.Class (liftEffect)
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (mergeForeign, readBooleanAt, readStringAt, toForeign, undefined)
import Rocksky.Lib.JsonRecord (pick)
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Lib.StorageCrypto (encryptCredential)
import Rocksky.Schema as T
import Rocksky.Schema.MirrorSources (SelectMirrorSource)
import Rocksky.Xrpc.App.Rocksky.Mirror.GetMirrorSources (present, providers)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (requireDid)
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.mirror.putMirrorSource"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let body = fromMaybe (toForeign {}) (inputBody input)
      let provider = fromMaybe "" (readStringAt "provider" body)
      Json <$> recoverWith (toForeign { provider, enabled: false, hasCredentials: false })
        ( timeoutMs 10000 do
            did <- requireDid (authDid input)
            unless (elem provider providers) (throwError (error ("Unknown provider: " <> provider)))
            users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
            user <- case head users of
              Nothing -> throwError (error "User not found")
              Just row -> pure row
            existingRows :: Array SelectMirrorSource <- run ctx.db (selectFrom T.mirrorSources # where_ (SQL.and (SQL.eq (toSQL T.mirrorSourcesC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.mirrorSourcesC.provider) (SQL.string provider))) # limit 1)
            let existing = head existingRows
            let enabled = readBooleanAt "enabled" body
            let username = readStringAt "externalUsername" body <|> (existing >>= toMaybe <<< _.externalUsername)
            when (enabled == Just true && provider /= "tealfm" && fromMaybe "" username == "") (throwError (error "externalUsername is required"))
            encryptedApiKey <- case readStringAt "apiKey" body of
              Nothing -> pure undefined
              Just "" -> pure (toForeign (toNullable (Nothing :: Maybe String)))
              Just key -> toForeign <$> encryptCredential key
            timestamp <- liftEffect now
            let watermark = fromTime (getTime timestamp - 86400000.0)
            let transition = enabled == Just true && (map _.enabled existing /= Just true)
            rows :: Array SelectMirrorSource <- case existing of
              Just row -> do
                let
                  updates = mergeForeign (pick [ "enabled", "pushEnabled", "externalUsername" ] body)
                    (toForeign { updatedAt: timestamp, encryptedApiKey, lastScrobbleSeenAt: if transition then toForeign watermark else undefined })
                runUpdateReturning ctx.db (updateForeign T.mirrorSources updates # where_ (SQL.eq (toSQL T.mirrorSourcesC.id) (SQL.string row.id)))
              Nothing -> runInsertReturning ctx.db
                ( insertForeign T.mirrorSources
                    [ mergeForeign
                        (toForeign { userId: user.id, provider, enabled: fromMaybe false enabled, pushEnabled: toNullable (readBooleanAt "pushEnabled" body), externalUsername: toNullable (readStringAt "externalUsername" body), lastScrobbleSeenAt: toNullable (if enabled == Just true then Just watermark else Nothing) })
                        (toForeign { encryptedApiKey })
                    ]
                )
            row <- firstRow rows
            recoverWith unit (liftEffect (Nats.publishString ctx.nc "rocksky.mirror.user" (provider <> ":" <> user.id)))
            present (Just did) provider (Just row)
        )
  }
