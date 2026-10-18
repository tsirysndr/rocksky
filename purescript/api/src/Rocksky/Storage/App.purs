-- | Storage provider management and client resolution (`src/storage/app.ts`).
module Rocksky.Storage.App (app, resolveStorageClient, ResolvedStorage) where

import Prelude

import Aws.S3 as S3
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate (now)
import Data.Traversable (traverse)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, notNull, toNullable)
import Drizzle.Builder (deleteFrom, insertForeign, limit, run, runDelete, runInsertReturning, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Foreign.Object as Object
import Hono as Hono
import Rocksky.Lib.Error (errorCode)
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Env (env)
import Rocksky.Lib.StorageCrypto (decryptCredential, encryptCredential)
import Rocksky.Schema as T
import Rocksky.Schema.UserStorageProviders (SelectUserStorageProvider)

type ResolvedStorage =
  { client :: S3.S3Client
  , bucket :: String
  , storageProviderId :: Nullable String
  }

resolveStorageClient :: Context -> String -> Maybe String -> Aff ResolvedStorage
resolveStorageClient ctx userId providerId = case providerId of
  Nothing -> managed
  Just "" -> managed
  Just id -> do
    providers :: Array SelectUserStorageProvider <- run ctx.db
      ( selectFrom T.userStorageProviders
          # where_
              ( SQL.and
                  (SQL.eq (toSQL T.userStorageProvidersC.id) (SQL.string id))
                  (SQL.eq (toSQL T.userStorageProvidersC.userId) (SQL.string userId))
              )
          # limit 1
      )
    case head providers of
      Nothing -> throwError (error ("Storage provider " <> id <> " not found for user"))
      Just provider -> do
        credentials <- sequential $ { accessKeyId: _, secretAccessKey: _ }
          <$> parallel (decryptCredential provider.accessKey)
          <*> parallel (decryptCredential provider.secretKey)
        client <- liftEffect $ S3.newClient
          { region: provider.region
          , endpoint: notNull provider.endpoint
          , credentials
          , forcePathStyle: null
          }
        pure { client, bucket: provider.bucket, storageProviderId: notNull provider.id }
  where
  managed = do
    client <- liftEffect $ S3.newClient
      { region: env."S3_REGION"
      , endpoint: notNull env."S3_ENDPOINT"
      , credentials: { accessKeyId: env."S3_ACCESS_KEY_ID", secretAccessKey: env."S3_SECRET_ACCESS_KEY" }
      , forcePathStyle: null
      }
    pure { client, bucket: env."S3_BUCKET_NAME", storageProviderId: null }

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.post a "/providers" \c -> Rest.withUser ctx c \user -> do
    parsed <- attempt (Hono.reqJson c)
    case parsed of
      Left _ -> Rest.text c 400 "Invalid JSON"
      Right body -> do
        let get key = fromMaybe "" (readStringAt key body)
        let label = get "label"
        let endpoint = get "endpoint"
        let bucket = get "bucket"
        let accessKey = get "access_key"
        let secretKey = get "secret_key"
        let region = fromMaybe "auto" (readStringAt "region" body)
        if label == "" || endpoint == "" || bucket == "" || accessKey == "" || secretKey == "" then
          Rest.text c 400 "Missing required fields: label, endpoint, bucket, access_key, secret_key"
        else do
          client <- liftEffect $ S3.newClient
            { region, endpoint: notNull endpoint, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }, forcePathStyle: null }
          connected <- attempt (S3.headBucket client bucket)
          case connected of
            Left err -> Rest.json c 422 (toForeign { error: "CONNECTIVITY_FAILED", message: connectivityMessage bucket err })
            Right _ -> do
              encrypted <- sequential $ { accessKey: _, secretKey: _ }
                <$> parallel (encryptCredential accessKey)
                <*> parallel (encryptCredential secretKey)
              verifiedAt <- liftEffect now
              rows :: Array SelectUserStorageProvider <- runInsertReturning ctx.db
                (insertForeign T.userStorageProviders [ toForeign { userId: user.id, label, endpoint, region, bucket, accessKey: encrypted.accessKey, secretKey: encrypted.secretKey, publicUrl: readStringAt "public_url" body # toNullable, verifiedAt } ])
              row <- Rest.firstRow rows
              response <- present row
              Rest.json c 201 response
  Hono.get a "/providers" \c -> Rest.withUser ctx c \user -> do
    rows :: Array SelectUserStorageProvider <- run ctx.db (selectFrom T.userStorageProviders # where_ (SQL.eq (toSQL T.userStorageProvidersC.userId) (SQL.string user.id)))
    views <- traverse present rows
    Rest.json c 200 (toForeign views)
  Hono.delete a "/providers/:id" \c -> Rest.withUser ctx c \user -> do
    let id = Hono.reqParam c "id"
    providers :: Array { id :: String } <- run ctx.db
      ( selectFieldsFrom { id: toSQL T.userStorageProvidersC.id } T.userStorageProviders
          # where_ (SQL.and (SQL.eq (toSQL T.userStorageProvidersC.id) (SQL.string id)) (SQL.eq (toSQL T.userStorageProvidersC.userId) (SQL.string user.id)))
          # limit 1
      )
    case head providers of
      Nothing -> Rest.text c 404 "Not found"
      Just _ -> do
        uploads :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.userUploadsC.id } T.userUploads # where_ (SQL.eq (toSQL T.userUploadsC.storageProviderId) (SQL.string id)) # limit 1)
        case head uploads of
          Just _ -> Rest.json c 409 (toForeign { error: "PROVIDER_IN_USE", message: "Cannot delete a storage provider that has uploads referencing it" })
          Nothing -> do
            runDelete ctx.db (deleteFrom T.userStorageProviders # where_ (SQL.eq (toSQL T.userStorageProvidersC.id) (SQL.string id)))
            liftEffect (Hono.body c (toForeign (null :: Nullable String)) 204 Object.empty)
  pure a
  where
  present row = pure $ toForeign { id: row.id, label: row.label, endpoint: row.endpoint, region: row.region, bucket: row.bucket, public_url: row.publicUrl, verified_at: row.verifiedAt, created_at: row.createdAt }
  connectivityMessage bucket err
    | S3.errorStatusCode err == Just 403 || S3.errorName err == Just "Forbidden" = "The bucket refused these credentials (403). Check the access key, secret key, and that they have permission on this bucket."
    | S3.errorStatusCode err == Just 404 || S3.errorName err == Just "NotFound" = "Bucket \"" <> bucket <> "\" was not found at that endpoint (404). Check the bucket name and endpoint URL."
    | S3.errorStatusCode err == Just 301 = "The bucket exists but in a different region (301). Set the region this bucket actually lives in."
    | errorCode err == Just "ENOTFOUND" || errorCode err == Just "ECONNREFUSED" = "Could not reach that endpoint. Check the endpoint URL."
    | message err /= "" && message err /= "UnknownError" = message err
    | otherwise = "Failed to connect to the S3 bucket with these credentials."
