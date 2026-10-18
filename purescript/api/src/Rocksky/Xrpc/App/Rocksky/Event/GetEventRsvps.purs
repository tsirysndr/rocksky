module Rocksky.Xrpc.App.Rocksky.Event.GetEventRsvps (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Drizzle.Builder (innerJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.EventView (eventGroupIds, findEvent, toRsvpView)
import Rocksky.Schema as T
import Rocksky.Schema.EventRsvps (SelectEventRsvp)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.event.getEventRsvps"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: { uri :: String, status :: Nullable String, limit :: Int, offset :: Int }
      found <- findEvent ctx params.uri
      case found of
        Nothing -> throwError (Xrpc.invalidRequestNamedError "Event not found" "NotFound")
        Just row -> do
          let group = SQL.inQuery (toSQL T.eventRsvpsC.eventId) (eventGroupIds row.events.id)
              condition = case toMaybe params.status of
                Just status | status /= "" -> SQL.and group (SQL.eq (toSQL T.eventRsvpsC.status) (SQL.string status))
                _ -> group
          rows :: Array { rsvp :: SelectEventRsvp, user :: SelectUser } <- run ctx.db
            (selectFieldsFrom { rsvp: tableSQL T.eventRsvps, user: tableSQL T.users } T.eventRsvps
              # innerJoin T.users (SQL.eq (toSQL T.eventRsvpsC.userId) (toSQL T.usersC.id))
              # where_ condition # orderBy [SQL.desc (toSQL T.eventRsvpsC.updatedAt), SQL.desc (toSQL T.eventRsvpsC.id)]
              # limit params.limit # offset params.offset)
          rsvps <- liftEffect (traverse (\{ rsvp, user } -> toRsvpView rsvp user) rows)
          pure (Util.json { rsvps })
  }
