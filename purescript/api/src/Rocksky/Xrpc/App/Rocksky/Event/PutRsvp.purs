module Rocksky.Xrpc.App.Rocksky.Event.PutRsvp (register, putRsvp, putRsvpWithAgent) where

import Prelude
import Atproto.Api (Agent)
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Atproto.XrpcServer as Xrpc
import Data.Array (elem, head, index, last)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.String (Pattern(..), split, stripPrefix)
import Drizzle.Builder (innerJoin, insertForeign, limit, onConflictDoUpdate, orderBy, run, runInsert, selectFieldsFrom, selectFrom)
import Drizzle.Database as Db
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.EventView (eventGroupIds, findEvent, rsvpGoing, rsvpInterested, rsvpNotGoing)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Events (SelectEvent)
import Rocksky.Schema.EventRsvps (SelectEventRsvp)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

type Input = { uri :: String, status :: String }
type Output = { uri :: String, status :: String }

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.event.putRsvp"
  { auth: Just ctx.authVerifier
  , handler: \input -> case Util.inputRecord input of
      Nothing -> Xrpc.throwInvalidRequest "Missing request body"
      Just body -> Util.json <$> putRsvp ctx body (Util.authDid input)
  }

putRsvp :: Context -> Input -> Maybe String -> Aff Output
putRsvp ctx input did = putRsvpWithAgent ctx input did createAgent

putRsvpWithAgent :: Context -> Input -> Maybe String -> (Context -> String -> Aff (Maybe Agent)) -> Aff Output
putRsvpWithAgent ctx input viewer agentFactory = do
  did <- case viewer of
    Just did | did /= "" -> pure did
    _ -> throwError (Xrpc.authRequiredError "Sign in to RSVP.")
  unless (elem input.status [rsvpGoing, rsvpInterested, rsvpNotGoing]) (Xrpc.throwInvalidRequest "Invalid RSVP status")
  found <- findEvent ctx input.uri
  row <- case found of
    Nothing -> throwError (Xrpc.invalidRequestNamedError "Event not found" "NotFound")
    Just row -> pure row
  users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
  user <- case head users of
    Nothing -> throwError (Xrpc.authRequiredError "Sign in to RSVP.")
    Just user -> pure user
  agent <- agentFactory ctx did >>= case _ of
    Nothing -> throwError (Xrpc.authRequiredError "Sign in again to RSVP.")
    Just agent -> pure agent
  Db.transaction ctx.db \tx -> do
    Db.execute tx (SQL.template ["SELECT pg_advisory_xact_lock(hashtextextended(", ", 0))"] [SQL.string (did <> ":" <> row.events.id)])
    existing :: Array { rsvp :: SelectEventRsvp, event :: SelectEvent } <- run tx
      (selectFieldsFrom { rsvp: tableSQL T.eventRsvps, event: tableSQL T.events } T.eventRsvps
        # innerJoin T.events (SQL.eq (toSQL T.eventRsvpsC.eventId) (toSQL T.eventsC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.eventRsvpsC.userId) (SQL.string user.id))
            (SQL.inQuery (toSQL T.eventRsvpsC.eventId) (eventGroupIds row.events.id)))
        # orderBy [SQL.desc (toSQL T.eventRsvpsC.updatedAt)] # limit 1)
    let event = fromMaybe row.events (_.event <$> head existing)
    rkey <- case head existing >>= last <<< split (Pattern "/") <<< _.uri <<< _.rsvp of
      Just key -> pure key
      Nothing -> liftEffect tidNextStr
    cid <- case toMaybe event.cid of
      Just value | value /= "" -> pure (Just value)
      _ -> do
        let parts = split (Pattern "/") (fromMaybe event.uri (stripPrefix (Pattern "at://") event.uri))
        record <- Api.getRecord agent { repo: fromMaybe "" (index parts 0), collection: fromMaybe "" (index parts 1), rkey: fromMaybe "" (index parts 2) }
        pure (toMaybe record.cid)
    subjectCid <- case cid of
      Just value | value /= "" -> pure value
      _ -> Xrpc.throwInvalidRequest "Event record is unavailable"
    published <- attempt (Api.putRecord agent
      { repo: did, collection: "community.lexicon.calendar.rsvp", rkey
      , record: toForeign { "$type": "community.lexicon.calendar.rsvp", subject: { uri: event.uri, cid: subjectCid }, status: input.status }
      , validate: false, swapRecord: Nothing })
    result <- case published of
      Left e | Api.xrpcErrorStatus e == Just 401 || Api.xrpcErrorStatus e == Just 403 -> throwError (Xrpc.authRequiredError "Sign in again to grant RSVP access.")
      Left e -> throwError e
      Right result -> pure result
    now <- liftEffect Date.now
    runInsert tx (insertForeign T.eventRsvps
      [toForeign { eventId: event.id, userId: user.id, uri: result.uri, cid: result.cid, status: input.status }]
      # onConflictDoUpdate
        { target: [toSQL T.eventRsvpsC.eventId, toSQL T.eventRsvpsC.userId]
        , set: { uri: result.uri, cid: result.cid, status: input.status, updatedAt: now }, where_: Nothing })
    pure { uri: result.uri, status: input.status }
