module Rocksky.Xrpc.App.Rocksky.Shout.Mutations where

import Prelude
import Atproto.Api as Api
import Atproto.XrpcServer (HandlerInput)
import Data.Array (null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.String (Pattern(..), Replacement(..), contains, replace, stripPrefix)
import Drizzle.Builder (deleteFrom, insertForeign, limit, run, runDelete, runInsert, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Playlists.Service (rkeyOf)
import Rocksky.Schema as T
import Rocksky.Schema.Shouts (SelectShout)
import Rocksky.Shouts.Service as Service
import Rocksky.Types.Shout (Shout, parseShout)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid, requireAgent, requireDid)
import Rocksky.Xrpc.Util (authDid, inputBody, paramString)

required :: String -> Maybe String -> Aff String
required message value = case value of
  Just s | s /= "" -> pure s
  _ -> throwError (error message)

parse :: String -> Foreign -> Aff Shout
parse label body = case parseShout body of
  Right shout -> pure shout
  Left errors -> throwError (error (label <> formatZodLike errors))

resolveShout :: Context -> String -> Aff SelectShout
resolveShout ctx id = do
  let column = if isJust (stripPrefix (Pattern "at://") id) then toSQL T.shoutsC.uri else toSQL T.shoutsC.id
  rows :: Array SelectShout <- run ctx.db (selectFrom T.shouts # where_ (SQL.eq column (SQL.string id)) # limit 1)
  Service.requireRow "Shout not found" rows

create :: Context -> HandlerInput -> Aff Unit
create ctx input = do
  did <- requireDid (authDid input)
  let body = fromMaybe (toForeign {}) (inputBody input)
  uri <- required "Missing shout subject uri" (readStringAt "uri" body)
  shout <- parse "Invalid shout data: " body
  user <- findUserByDid ctx did
  agent <- requireAgent ctx did
  subjectUri <- if contains (Pattern "/app.rocksky.") uri then pure uri else do
    let target = replace (Pattern "at://") (Replacement "") uri
    rows :: Array { did :: String } <- run ctx.db (selectFieldsFrom { did: toSQL T.usersC.did } T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string target)) (SQL.eq (toSQL T.usersC.handle) (SQL.string target))) # limit 1)
    profile <- Service.requireRow "Profile not found" rows
    pure ("at://" <> profile.did)
  Service.createShout ctx shout subjectUri user agent

reply :: Context -> HandlerInput -> Aff Unit
reply ctx input = do
  did <- requireDid (authDid input)
  let body = fromMaybe (toForeign {}) (inputBody input)
  id <- required "Missing parent shout id" (readStringAt "shoutId" body)
  shout <- parse "Invalid reply data: " body
  user <- findUserByDid ctx did
  agent <- requireAgent ctx did
  uri <- if isJust (stripPrefix (Pattern "at://") id) then pure id else do
    rows :: Array { uri :: String } <- run ctx.db (selectFieldsFrom { uri: toSQL T.shoutsC.uri } T.shouts # where_ (SQL.eq (toSQL T.shoutsC.id) (SQL.string id)) # limit 1)
    row <- Service.requireRow "Parent shout not found" rows
    pure row.uri
  Service.replyShout ctx shout uri user agent

report :: Context -> HandlerInput -> Aff Unit
report ctx input = do
  did <- requireDid (authDid input)
  id <- required "Missing shout id" (inputBody input >>= readStringAt "shoutId")
  user <- findUserByDid ctx did
  shout <- resolveShout ctx id
  existing :: Array { id :: String } <- run ctx.db
    (selectFieldsFrom { id: toSQL T.shoutReportsC.id } T.shoutReports
      # where_ (SQL.and (SQL.eq (toSQL T.shoutReportsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.shoutReportsC.shoutId) (SQL.string shout.id))) # limit 1)
  when (null existing) $ runInsert ctx.db (insertForeign T.shoutReports [toForeign { userId: user.id, shoutId: shout.id }])

remove :: Context -> HandlerInput -> Aff Unit
remove ctx input = do
  did <- requireDid (authDid input)
  id <- required "Missing shout id" (paramString input "id")
  user <- findUserByDid ctx did
  agent <- requireAgent ctx did
  shout <- resolveShout ctx id
  unless (shout.authorId == user.id) (throwError (error "Forbidden"))
  replies :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.shoutsC.id } T.shouts # where_ (SQL.eq (toSQL T.shoutsC.parentId) (SQL.string shout.id)))
  let ids = map (SQL.string <<< _.id) replies
  unless (null ids) do
    runDelete ctx.db (deleteFrom T.shoutLikes # where_ (SQL.inArray (toSQL T.shoutLikesC.shoutId) ids))
    runDelete ctx.db (deleteFrom T.shoutReports # where_ (SQL.inArray (toSQL T.shoutReportsC.shoutId) ids))
    runDelete ctx.db (deleteFrom T.profileShouts # where_ (SQL.inArray (toSQL T.profileShoutsC.shoutId) ids))
  runDelete ctx.db (deleteFrom T.profileShouts # where_ (SQL.eq (toSQL T.profileShoutsC.shoutId) (SQL.string shout.id)))
  runDelete ctx.db (deleteFrom T.shoutLikes # where_ (SQL.eq (toSQL T.shoutLikesC.shoutId) (SQL.string shout.id)))
  runDelete ctx.db (deleteFrom T.shoutReports # where_ (SQL.eq (toSQL T.shoutReportsC.shoutId) (SQL.string shout.id)))
  unless (null ids) $ runDelete ctx.db (deleteFrom T.shouts # where_ (SQL.inArray (toSQL T.shoutsC.id) ids))
  runDelete ctx.db (deleteFrom T.shouts # where_ (SQL.eq (toSQL T.shoutsC.id) (SQL.string shout.id)))
  repo <- liftEffect (Api.assertDid agent)
  Api.deleteRecord agent { repo, collection: "app.rocksky.shout", rkey: rkeyOf shout.uri }

like :: Boolean -> Context -> HandlerInput -> Aff Unit
like enabled ctx input = do
  did <- requireDid (authDid input)
  uri <- required "Missing shout uri" (inputBody input >>= readStringAt "uri")
  user <- findUserByDid ctx did
  agent <- requireAgent ctx did
  (if enabled then Service.likeShout else Service.unlikeShout) ctx uri user agent
