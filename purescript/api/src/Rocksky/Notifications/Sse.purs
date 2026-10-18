module Rocksky.Notifications.Sse (app) where

import Prelude
import Data.Either (either)
import Data.Array (head)
import Drizzle.Builder (run, selectFieldsFrom, limit)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Rocksky.Schema as T
import Data.Maybe (Maybe(..))
import Data.Nullable (null, notNull, toMaybe)
import Effect (Effect)
import Effect.Aff (attempt, error, finally, forkAff, killFiber)
import Effect.Class (liftEffect)
import Effect.Exception as Exception
import Effect.Ref as Ref
import Hono as Hono
import Hono.Streaming as SSE
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Foreign (stringify, toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Notifications.Service (getUnreadCount, notificationSubject)

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/stream" \c -> case Hono.reqQuery c "token" of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just "" -> Rest.text c 401 "Unauthorized"
    Just token -> do
      payload <- either (const Nothing) Just <$> attempt (verifyToken ctx.db token)
      case payload >>= toMaybe <<< _.did of
        Nothing -> Rest.text c 401 "Unauthorized"
        Just did -> do
          users :: Array { id :: String } <- run ctx.db
            (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
          case head users of
            Nothing -> Rest.text c 401 "Unauthorized"
            Just user -> liftEffect $ SSE.streamSSE c \stream -> do
              sub <- liftEffect (Nats.subscribePull ctx.nc (notificationSubject user.id))
              closed <- liftEffect (Ref.new false)
              let
                close = do
                  done <- Ref.read closed
                  unless done do
                    Ref.write true closed
                    void (Exception.try (Nats.unsubscribe sub))
              liftEffect (SSE.onAbort stream close)
              recoverWith unit do
                unreadCount <- getUnreadCount ctx user.id
                SSE.writeSSE stream { event: notNull "unread", id: null, data: stringify (toForeign { unreadCount }) }
              let
                heartbeatLoop = do
                  done <- liftEffect (Ref.read closed)
                  unless done do
                    SSE.sleep stream 25000
                    stopped <- liftEffect (Ref.read closed)
                    unless stopped do
                      SSE.writeSSE stream { event: notNull "ping", id: null, data: "" }
                      heartbeatLoop
              heartbeat <- forkAff (recoverWith unit heartbeatLoop)
              let
                consume = Nats.nextMessage sub >>= case _ of
                  Nothing -> pure unit
                  Just msg -> do
                    done <- liftEffect (Ref.read closed)
                    unless done do
                      SSE.writeSSE stream { event: notNull "notification", id: null, data: Nats.decodeString msg }
                      consume
              finally (liftEffect close *> killFiber (error "notification stream closed") heartbeat) (recoverWith unit consume)
  pure a
