module Rocksky.Xrpc.App.Rocksky.Graph.Common where

import Prelude
import Data.Array (head, null)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.Number as Number
import Data.Number.Format as NumberFormat
import Drizzle.Database (executeRows)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign, undefined, unsafeFromForeign)
import Rocksky.Lib.Rsql (numberValue)
import Rocksky.Schema as T
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
  Just text | text /= "" -> [ SQL.lt (toSQL T.followsC.createdAt) (SQL.date (Date.fromTime (fromMaybe Number.nan (numberValue text)))) ]
  _ -> []

cursorView :: Maybe Date.JSDate -> Foreign
cursorView = maybe undefined (toForeign <<< NumberFormat.toString <<< Date.getTime)

retrieve :: Boolean -> Context -> QueryParams -> Aff Foreign
retrieve followers ctx params = do
  result <- attempt do
    let
      actorColumn = SQL.raw (if followers then "f.subject_did" else "f.follower_did")
      otherColumn = SQL.raw (if followers then "f.follower_did" else "f.subject_did")
      base = SQL.eq actorColumn (SQL.string params.actor)
      dids = fromMaybe [] (toMaybe params.dids)
      countCondition = if null dids then base else SQL.and base (SQL.inArray otherColumn (map SQL.string dids))
      cursorFilter = case toMaybe params.cursor of
        Just text | text /= "" -> SQL.template [ " AND f.xata_createdat < ", "" ] [ SQL.date (Date.fromTime (fromMaybe Number.nan (numberValue text))) ]
        _ -> SQL.empty
      profileJson = SQL.raw
        """jsonb_build_object('id', u.xata_id, 'did', u.did, 'handle', u.handle,
          'displayName', u.display_name, 'avatar', u.avatar,
          'createdAt', to_char(u.xata_createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'updatedAt', to_char(u.xata_updatedat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))"""
      query = SQL.template
        [ "WITH page AS (SELECT "
        , " AS profile, f.xata_createdat AS followed_at FROM follows f LEFT JOIN users u ON u.did = "
        , " WHERE "
        , ""
        , " ORDER BY f.xata_createdat DESC LIMIT "
        , ") SELECT coalesce((SELECT "
        , " FROM users u WHERE u.did = "
        , " LIMIT 1), '{}'::jsonb) AS subject, coalesce((SELECT jsonb_agg(profile ORDER BY followed_at DESC) FROM page), '[]'::jsonb) AS profiles, (SELECT (extract(epoch FROM min(followed_at)) * 1000)::bigint::text FROM page) AS cursor, (SELECT count(*)::int FROM follows f WHERE "
        , ") AS count"
        ]
        [ profileJson, otherColumn, countCondition, cursorFilter, SQL.int (fromMaybe 50 (toMaybe params.limit)), profileJson, SQL.string params.actor, countCondition ]
    rows <- executeRows ctx.db query
    let
      page = case head rows of
        Just row -> unsafeFromForeign row :: { subject :: Foreign, profiles :: Array Foreign, cursor :: Nullable String, count :: Int }
        Nothing -> { subject: toForeign {}, profiles: [], cursor: toNullable Nothing, count: 0 }
      body = toForeign { subject: page.subject, cursor: maybe undefined toForeign (toMaybe page.cursor), count: page.count }
    pure (mergeForeign body (if followers then toForeign { followers: page.profiles } else toForeign { follows: page.profiles }))
  case result of
    Right body -> pure body
    Left e -> throwError (error ("Failed to retrieve user " <> (if followers then "followers" else "follows") <> ": " <> describeError e))
