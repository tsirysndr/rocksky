module Rocksky.Xrpc.App.Rocksky.Graph.Common where

import Prelude
import Control.Parallel (parallel, sequential)
import Data.Array (head, last, null)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.Number.Format as NumberFormat
import Data.Traversable (traverse)
import Drizzle.Builder (leftJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign, undefined)
import Rocksky.Lib.Rsql (numberValue)
import Rocksky.Schema as T
import Rocksky.Schema.Follows (SelectFollows)
import Rocksky.Schema.Users (SelectUser)

type QueryParams = { actor :: String, limit :: Nullable Int, cursor :: Nullable String, dids :: Nullable (Array String) }

profile :: SelectUser -> Effect Foreign
profile user = do
  createdAt <- Date.toISOString user.createdAt
  updatedAt <- Date.toISOString user.updatedAt
  pure (toForeign { id: user.id, did: user.did, handle: user.handle, displayName: user.displayName, avatar: user.avatar, createdAt, updatedAt })

subjectView :: Maybe SelectUser -> Effect Foreign
subjectView = maybe (pure (toForeign {})) profile

cursorCondition :: Nullable String -> Array SQL.SQL
cursorCondition cursor = case toMaybe cursor of
  Just text | text /= "" -> [SQL.lt (toSQL T.followsC.createdAt) (SQL.date (Date.fromTime (fromMaybe Number.nan (numberValue text))))]
  _ -> []

cursorView :: Maybe Date.JSDate -> Foreign
cursorView = maybe undefined (toForeign <<< NumberFormat.toString <<< Date.getTime)

retrieve :: Boolean -> Context -> QueryParams -> Aff Foreign
retrieve followers ctx params = do
  result <- attempt do
    let actorColumn = if followers then toSQL T.followsC.subject_did else toSQL T.followsC.follower_did
        otherColumn = if followers then toSQL T.followsC.follower_did else toSQL T.followsC.subject_did
        base = SQL.eq actorColumn (SQL.string params.actor)
        dids = fromMaybe [] (toMaybe params.dids)
        countCondition = if null dids then base else SQL.and base (SQL.inArray otherColumn (map SQL.string dids))
        whereCondition = fromMaybe countCondition (SQL.andAll ([countCondition] <> cursorCondition params.cursor))
        -- The source's followers cursor query passes false for an explicit
        -- empty dids array; retain its difference from the joined page query.
        cursorWhere = if followers && not (null (cursorCondition params.cursor)) && toMaybe params.dids == Just []
          then SQL.and whereCondition (SQL.bool false) else whereCondition
        size = fromMaybe 50 (toMaybe params.limit)
    rows <- sequential $ { subject: _, users: _, cursors: _, count: _ }
      <$> parallel (run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string params.actor))) :: Aff (Array SelectUser))
      <*> parallel (run ctx.db
        (selectFieldsFrom { users: tableSQL T.users } T.follows # where_ whereCondition
          # leftJoin T.users (SQL.eq (toSQL T.usersC.did) otherColumn)
          # orderBy [SQL.desc (toSQL T.followsC.createdAt)] # limit size) :: Aff (Array { users :: SelectUser }))
      <*> parallel (run ctx.db (selectFrom T.follows # where_ cursorWhere
        # orderBy [SQL.desc (toSQL T.followsC.createdAt)] # limit size) :: Aff (Array SelectFollows))
      <*> parallel (run ctx.db (selectFieldsFrom { count: SQL.count } T.follows # where_ countCondition) :: Aff (Array { count :: Int }))
    subject <- liftEffect (subjectView (head rows.subject))
    users <- liftEffect (traverse (profile <<< _.users) rows.users)
    let body = toForeign { subject, cursor: cursorView (_.createdAt <$> last rows.cursors), count: fromMaybe 0 (_.count <$> head rows.count) }
    pure (mergeForeign body (if followers then toForeign { followers: users } else toForeign { follows: users }))
  case result of
    Right body -> pure body
    Left e -> throwError (error ("Failed to retrieve user " <> (if followers then "followers" else "follows") <> ": " <> describeError e))
