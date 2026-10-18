module Rocksky.Xrpc.App.Rocksky.Graph.Mutations (mutate, mutateWithAgent) where

import Prelude
import Atproto.Api (Agent)
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Atproto.Lexicon as Lexicon
import Consola as Log
import Control.Parallel (parallel, sequential)
import Data.Array (head, last, length, null)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (notNull, toNullable)
import Data.Nullable as Nullable
import Data.String (Pattern(..), split)
import Data.Traversable (traverse)
import Drizzle.Builder (deleteFrom, insertForeign, leftJoin, limit, onConflictDoNothing, orderBy, run, runDelete, runInsert, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Notifications.Service (createNotification)
import Rocksky.Schema as T
import Rocksky.Schema.Follows (SelectFollows)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Graph.Common (profile, subjectView, cursorView)

mutate :: Boolean -> Context -> String -> Maybe String -> Aff Foreign
mutate follow ctx account did = mutateWithAgent follow ctx account did createAgent

mutateWithAgent :: Boolean -> Context -> String -> Maybe String -> (Context -> String -> Aff (Maybe Agent)) -> Aff Foreign
mutateWithAgent follow ctx account viewer factory = do
  result <- attempt do
    did <- case viewer of
      Just did | did /= "" -> pure did
      _ -> throwError (error "User is not authenticated")
    when (account == did) (throwError (error "User cannot follow themselves"))
    let condition = SQL.and (SQL.eq (toSQL T.followsC.follower_did) (SQL.string did)) (SQL.eq (toSQL T.followsC.subject_did) (SQL.string account))
    existing :: Array SelectFollows <- run ctx.db (selectFrom T.follows # where_ condition)
    when (follow && not (null existing)) (throwError (error "User is already following"))
    when (not follow && null existing) (throwError (error "User is not following"))
    agent <- factory ctx did >>= case _ of
      Nothing -> throwError (error "Unauthorized")
      Just agent -> pure agent
    if follow then do
      rkey <- liftEffect tidNextStr
      createdAt <- liftEffect (Date.now >>= Date.toISOString)
      let record = toForeign { "$type": "app.rocksky.graph.follow", subject: account, createdAt }
      case Lexicon.validateRecord ctx.lexicons "app.rocksky.graph.follow" record of
        Left reason -> do
          liftEffect (Log.info reason)
          throwError (error "Invalid record")
        Right _ -> pure unit
      repo <- liftEffect (Api.assertDid agent)
      published <- Api.createRecord agent { repo, collection: "app.rocksky.graph.follow", rkey: notNull rkey, record, validate: false }
      liftEffect (Log.info ("Follow record created at: " <> published.uri))
      runInsert ctx.db (insertForeign T.follows [toForeign { uri: published.uri, subject_did: account, follower_did: did }] # onConflictDoNothing)
    else do
      rows :: Array SelectFollows <- run ctx.db (selectFrom T.follows # where_ condition)
      row <- case head rows of
        Nothing -> throwError (error "Follow not found")
        Just row -> pure row
      repo <- liftEffect (Api.assertDid agent)
      Api.deleteRecord agent { repo, collection: "app.rocksky.graph.follow", rkey: fromMaybe "" (last (split (Pattern "/") row.uri)) }
      runDelete ctx.db (deleteFrom T.follows # where_ condition)
    rows <- sequential $ { subject: _, followers: _ }
      <$> parallel (run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string account))) :: Aff (Array SelectUser))
      <*> parallel (run ctx.db
        (selectFieldsFrom { users: tableSQL T.users } T.follows
          # where_ (SQL.eq (toSQL T.followsC.subject_did) (SQL.string account))
          # leftJoin T.users (SQL.eq (toSQL T.usersC.did) (toSQL T.followsC.follower_did))
          # orderBy [SQL.desc (toSQL T.followsC.createdAt)] # limit 50) :: Aff (Array { users :: SelectUser }))
    when follow do
      follower :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
      void (createNotification ctx
        { userId: toNullable (_.id <$> head rows.subject), actorId: toNullable (_.id <$> head follower)
        , type: "follow", shoutId: Nullable.null, subjectUri: notNull ("at://" <> did) })
    subject <- liftEffect (subjectView (head rows.subject))
    followers <- liftEffect (traverse (profile <<< _.users) rows.followers)
    let body = toForeign { subject, followers }
    pure (if follow then body else mergeForeign body (toForeign
      { cursor: cursorView (if length rows.followers == 50 then _.createdAt <<< _.users <$> last rows.followers else Nothing) }))
  case result of
    Right body -> pure body
    Left e -> throwError (error ("Failed to retrieve follow: " <> describeError e))
