module Rocksky.Users.Moderation (register, registerWith) where

import Prelude
import Atproto.Api as Api
import Data.Array as A
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Traversable (for_)
import Drizzle.Builder (deleteFrom, insertForeign, limit, run, runDelete, runInsertReturning, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Metrics as Metrics
import Rocksky.Playlists.Service (rkeyOf)
import Rocksky.Schema as T
import Rocksky.Users.Common as Common
import Rocksky.Users.Mutations as Mutations

type Operations = { actor :: Mutations.Operations, deleteRecord :: Api.Agent -> String -> Aff Unit }

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx
  { actor: Mutations.operations ctx
  , deleteRecord: \agent uri -> do
      repo <- liftEffect (Api.assertDid agent)
      void (Api.deleteRecord agent { repo, collection: "app.rocksky.shout", rkey: rkeyOf uri }) }

registerWith :: Context -> Operations -> Hono.App -> Effect Unit
registerWith ctx ops app = do
  for_ ["POST", "DELETE"] \method -> (if method == "POST" then Hono.post else Hono.delete) app "/:did/app.rocksky.shout/:rkey/report" \c -> do
    liftEffect (Metrics.count ctx.metrics method "/users/:did/app.rocksky.shout/:rkey/report")
    case bearerFrom (Hono.reqHeader c "authorization") of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just bearer -> do
        payload <- verifyToken ctx.db bearer
        shouts <- run ctx.db (selectFrom T.shouts # where_ (SQL.eq (toSQL T.shoutsC.uri) (SQL.string (Common.uri c "shout"))) # limit 1) :: Aff (Array { id :: String })
        users <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (F.unsafeFromForeign (F.toForeign payload.did)))) # limit 1) :: Aff (Array { id :: String })
        case A.head shouts, A.head users of
          Nothing, _ -> Rest.text c 404 "Shout not found"
          _, Nothing -> Rest.text c 401 "Unauthorized"
          Just shout, Just user -> do
            reports <- run ctx.db (selectFrom T.shoutReports # where_ (SQL.and (SQL.eq (toSQL T.shoutReportsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.shoutReportsC.shoutId) (SQL.string shout.id))) # limit 1) :: Aff (Array { id :: String, userId :: String })
            case method, A.head reports of
              "POST", Just report -> Rest.json c 200 (F.toForeign report)
              "POST", Nothing -> do
                rows <- runInsertReturning ctx.db (insertForeign T.shoutReports [F.toForeign { userId: user.id, shoutId: shout.id }]) :: Aff (Array {})
                Rest.json c 200 (fromMaybe F.undefined (F.toForeign <$> A.head rows))
              _, Nothing -> Rest.text c 404 "Report not found"
              _, Just report | report.userId /= user.id -> Rest.text c 403 "Forbidden"
              _, Just report -> do
                runDelete ctx.db (deleteFrom T.shoutReports # where_ (SQL.eq (toSQL T.shoutReportsC.id) (SQL.string report.id)))
                Rest.json c 200 (F.toForeign report)
  Hono.delete app "/:did/app.rocksky.shout/:rkey" \c -> do
    liftEffect (Metrics.count ctx.metrics "DELETE" "/users/:did/app.rocksky.shout/:rkey")
    Mutations.withActor ctx ops.actor c \user agent -> do
      shouts <- run ctx.db (selectFrom T.shouts # where_ (SQL.eq (toSQL T.shoutsC.uri) (SQL.string (Common.uri c "shout"))) # limit 1) :: Aff (Array { id :: String, authorId :: String, uri :: String })
      case A.head shouts of
        Nothing -> Rest.text c 404 "Shout not found"
        Just shout | shout.authorId /= user.id -> Rest.text c 403 "Forbidden"
        Just shout -> do
          replies <- run ctx.db (selectFieldsFrom { replies: { id: toSQL T.shoutsC.id } } T.shouts # where_ (SQL.eq (toSQL T.shoutsC.parentId) (SQL.string shout.id))) :: Aff (Array { replies :: { id :: String } })
          let ids = map (SQL.string <<< _.id <<< _.replies) replies
          let replyCondition col = SQL.inArray col ids
          let parentCondition col = SQL.eq col (SQL.string shout.id)
          runDelete ctx.db (deleteFrom T.shoutLikes # where_ (replyCondition (toSQL T.shoutLikesC.shoutId)))
          runDelete ctx.db (deleteFrom T.shoutReports # where_ (replyCondition (toSQL T.shoutReportsC.shoutId)))
          runDelete ctx.db (deleteFrom T.profileShouts # where_ (parentCondition (toSQL T.profileShoutsC.shoutId)))
          runDelete ctx.db (deleteFrom T.profileShouts # where_ (replyCondition (toSQL T.profileShoutsC.shoutId)))
          runDelete ctx.db (deleteFrom T.shoutLikes # where_ (parentCondition (toSQL T.shoutLikesC.shoutId)))
          runDelete ctx.db (deleteFrom T.shoutReports # where_ (parentCondition (toSQL T.shoutReportsC.shoutId)))
          runDelete ctx.db (deleteFrom T.shouts # where_ (replyCondition (toSQL T.shoutsC.id)))
          runDelete ctx.db (deleteFrom T.shouts # where_ (parentCondition (toSQL T.shoutsC.id)))
          ops.deleteRecord agent shout.uri
          Rest.json c 200 (F.toForeign shout)
