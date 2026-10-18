module Rocksky.Uploads.Stream (register, registerWith, managedClient, getManagedObject) where

import Prelude
import Aws.S3 as S3
import Data.Array as A
import Data.Maybe (Maybe(..))
import Data.Nullable (null, notNull, toNullable)
import Data.Traversable (for_)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Hono as Hono
import Node.Crypto (randomBytesHex)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.UserUploads (SelectUserUpload)

managedClient :: Effect S3.S3Client
managedClient = S3.newClient
  { region: env."S3_REGION", endpoint: notNull env."S3_ENDPOINT"
  , credentials: { accessKeyId: env."S3_ACCESS_KEY_ID", secretAccessKey: env."S3_SECRET_ACCESS_KEY" }, forcePathStyle: null }

getManagedObject :: String -> Maybe String -> Aff Foreign
getManagedObject key range = do
  client <- liftEffect managedClient
  S3.getObjectRaw client env."S3_BUCKET_NAME" key (toNullable range)

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx getManagedObject

registerWith :: Context -> (String -> Maybe String -> Aff Foreign) -> Hono.App -> Effect Unit
registerWith ctx getObject a = do
  Hono.get a "/stream-token" \c -> Rest.withUser ctx c \user -> do
    token <- liftEffect (randomBytesHex 20)
    let ttl = if Hono.reqQuery c "purpose" == Just "cast" then 86400 else 3600
    Redis.setEx ctx.redis ("stream:" <> token) ttl user.id
    Rest.json c 200 (F.toForeign { token, expiresIn: ttl })
  Hono.options a "/:id/stream" \c -> liftEffect (Hono.body c (F.toForeign null) 204 (Object.fromHomogeneous
    { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS"
    , "Access-Control-Allow-Headers": "Range, Authorization", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges"
    , "Access-Control-Max-Age": "86400" }))
  Hono.get a "/:id/stream" \c -> do
    user <- case Hono.reqQuery c "token" of
      Just token | token /= "" -> do
        id <- Redis.get ctx.redis ("stream:" <> token)
        case id of
          Just value | value /= "" -> A.head <$> (run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.id) (SQL.string value)) # limit 1) :: Aff (Array SelectUser))
          _ -> pure Nothing
      _ -> Rest.resolveUser ctx c
    case user of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just value -> do
        rows <- run ctx.db (selectFrom T.userUploads # where_ (SQL.and
          (SQL.eq (toSQL T.userUploadsC.id) (SQL.string (Hono.reqParam c "id")))
          (SQL.eq (toSQL T.userUploadsC.userId) (SQL.string value.id))) # limit 1) :: Aff (Array SelectUserUpload)
        case A.head rows of
          Nothing -> Rest.text c 404 "Upload not found"
          Just upload -> do
            let range = case Hono.reqHeader c "range" of
                  Just "" -> Nothing
                  other -> other
            response <- getObject upload.r2Key range
            case F.path "Body" response of
              Nothing -> Rest.text c 500 "Stream unavailable"
              Just body -> do
                let contentType = if upload.mimeType /= "" then upload.mimeType else case F.readStringAt "ContentType" response of
                      Just mime | mime /= "" -> mime
                      _ -> "audio/mpeg"
                let headers = Object.fromHomogeneous
                      { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"
                      , "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Range, Authorization"
                      , "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" }
                let withLength = case F.path "ContentLength" response of
                      Nothing -> headers
                      Just n -> Object.insert "Content-Length" (F.stringValue n) headers
                liftEffect do
                  for_ range \_ -> for_ (F.readStringAt "ContentRange" response) \r ->
                    when (r /= "") (Hono.setHeader c "Content-Range" r)
                  stream <- S3.transformToWebStream body
                  Hono.body c stream (case range of
                    Nothing -> 200
                    Just _ -> 206) withLength
