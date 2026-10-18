-- Session maintenance from src/db.ts, separated to avoid Db/Context import cycles.
module Rocksky.Auth.SessionMaintenance (updateExpiresAt, refreshSessionsAboutToExpire, refreshWith) where

import Prelude
import Atproto.Api as Api
import Consola as Consola
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..))
import Data.Traversable (for_)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Foreign (isUndefined)
import Foreign.Object as Object
import Kysely as Kysely
import Rocksky.Context (Context)
import Rocksky.Db (Database, listAuthSessions)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Foreign as F
import Rocksky.Scripts.Common (requireAgent)

updateExpiresAt :: Database -> Aff Unit
updateExpiresAt db = do
  sessions <- listAuthSessions db
  liftEffect (Consola.info ("Found " <> show (A.length sessions) <> " sessions to update"))
  for_ sessions \session -> do
    parsed <- case F.parseJson session.session of
      Left message -> throwError (error message)
      Right value -> pure value
    -- Kysely omits undefined assignments; an empty update fails rather than
    -- replacing an existing expiry with NULL. Explicit JSON null is retained.
    expiry <- case F.path "tokenSet" parsed >>= F.asObject >>= Object.lookup "expires_at" of
      Nothing -> throwError (error "Session tokenSet.expires_at is undefined")
      Just value | isUndefined value -> throwError (error "Session tokenSet.expires_at is undefined")
      Just value -> pure value
    liftEffect (Consola.infoF session.key [expiry])
    Kysely.raw db "update auth_session set expiresAt = ? where key = ?" [expiry, F.toForeign session.key]
  liftEffect (Consola.info ("Updated " <> show (A.length sessions) <> " sessions"))

refreshWith :: Database -> String -> (String -> Aff Unit) -> Aff Unit -> Aff Unit
refreshWith db now refresh pause = do
  -- Source selects all future expiries, not only a short near-expiry window.
  sessions <- Kysely.rawRows db "select * from auth_session where expiresAt is not ? and expiresAt > ? order by expiresAt asc" [F.toForeign "NULL", F.toForeign now]
  for_ sessions \session -> do
    let row = F.unsafeFromForeign session :: { key :: String }
    liftEffect (Consola.infoF ("Session about to expire: " <> row.key) [session])
    refresh row.key
    pause
  liftEffect (Consola.info ("Found " <> show (A.length sessions) <> " sessions to refresh"))

refreshSessionsAboutToExpire :: Database -> Context -> Aff Unit
refreshSessionsAboutToExpire db ctx = do
  now <- liftEffect (Date.now >>= Date.toISOString)
  refreshWith db now (\did -> requireAgent ctx did >>= void <<< Api.getPreferences) (sleep 200)
