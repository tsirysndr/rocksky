-- | Bindings for `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`:
-- | the client, the object/bucket commands the API uses, and presigned URLs.
module Aws.S3
  ( S3Client
  , ClientConfig
  , Credentials
  , newClient
  , destroy
  , PutObjectInput
  , putObject
  , putObjectWithMetadata
  , putObjectStream
  , GetObjectOutput
  , getObject
  , getObjectWithSignal
  , getObjectStream
  , getObjectRaw
  , transformToWebStream
  , deleteObject
  , HeadObjectOutput
  , headObject
  , headBucket
  , ListObjectsV2Input
  , ListObjectsV2Output
  , S3Object
  , listObjectsV2
  , getSignedGetUrl
  , getSignedPutUrl
  , errorStatusCode
  , errorName
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.JSDate (JSDate)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Exception (Error)
import Fetch (AbortSignal)
import Foreign (Foreign)
import Foreign.Object (Object)
import Node.Buffer (Buffer)
import Node.Stream (Readable)

foreign import data S3Client :: Type

type Credentials = { accessKeyId :: String, secretAccessKey :: String }

-- | `endpoint` null → AWS default endpoints; `forcePathStyle` null → SDK default.
type ClientConfig =
  { region :: String
  , endpoint :: Nullable String
  , credentials :: Credentials
  , forcePathStyle :: Nullable Boolean
  }

-- | `new S3Client({ region, endpoint, credentials, forcePathStyle })`.
foreign import newClient :: ClientConfig -> Effect S3Client

-- | `client.destroy()`.
foreign import destroy :: S3Client -> Effect Unit

type PutObjectInput body =
  { bucket :: String
  , key :: String
  , body :: body
  , contentType :: Nullable String
  , contentLength :: Nullable Number
  }

foreign import putObjectImpl :: forall body. S3Client -> PutObjectInput body -> Effect (Promise Unit)

-- | `client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, ContentLength }))`
-- | with a Buffer body.
putObject :: S3Client -> PutObjectInput Buffer -> Aff Unit
putObject c i = toAffE (putObjectImpl c i)

-- | Same as `putObject` with a Node readable stream as body (set
-- | `contentLength` when known: the SDK cannot size a stream itself).
putObjectStream :: S3Client -> PutObjectInput (Readable ()) -> Aff Unit
putObjectStream c i = toAffE (putObjectImpl c i)

type GetObjectOutput body =
  { body :: body
  , contentType :: Nullable String
  , contentLength :: Nullable Number
  , eTag :: Nullable String
  , lastModified :: Nullable JSDate
  }

foreign import getObjectBufferImpl :: S3Client -> String -> String -> Effect (Promise (GetObjectOutput Buffer))

-- | `client.send(new GetObjectCommand({ Bucket, Key }))` with the body read
-- | fully via `Body.transformToByteArray()`.
getObject :: S3Client -> String -> String -> Aff (GetObjectOutput Buffer)
getObject c bucket key = toAffE (getObjectBufferImpl c bucket key)

foreign import getObjectStreamImpl :: S3Client -> String -> String -> Effect (Promise (GetObjectOutput (Readable ())))

-- | `GetObjectCommand` keeping `Body` as the Node readable stream it is.
getObjectStream :: S3Client -> String -> String -> Aff (GetObjectOutput (Readable ()))
getObjectStream c bucket key = toAffE (getObjectStreamImpl c bucket key)

foreign import deleteObjectImpl :: S3Client -> String -> String -> Effect (Promise Unit)

-- | `client.send(new DeleteObjectCommand({ Bucket, Key }))`.
deleteObject :: S3Client -> String -> String -> Aff Unit
deleteObject c bucket key = toAffE (deleteObjectImpl c bucket key)

type HeadObjectOutput =
  { contentType :: Nullable String
  , contentLength :: Nullable Number
  , eTag :: Nullable String
  , lastModified :: Nullable JSDate
  }

foreign import headObjectImpl :: S3Client -> String -> String -> Effect (Promise HeadObjectOutput)

-- | `client.send(new HeadObjectCommand({ Bucket, Key }))`; rejects with a
-- | `NotFound` error for a missing key.
headObject :: S3Client -> String -> String -> Aff HeadObjectOutput
headObject c bucket key = toAffE (headObjectImpl c bucket key)

foreign import headBucketImpl :: S3Client -> String -> Effect (Promise Unit)

-- | `client.send(new HeadBucketCommand({ Bucket }))`; rejects when the bucket
-- | is unreachable (inspect with `errorStatusCode` / `errorName`).
headBucket :: S3Client -> String -> Aff Unit
headBucket c bucket = toAffE (headBucketImpl c bucket)

type ListObjectsV2Input =
  { bucket :: String
  , prefix :: Nullable String
  , continuationToken :: Nullable String
  , maxKeys :: Nullable Int
  }

type S3Object =
  { key :: String
  , size :: Number
  , eTag :: Nullable String
  , lastModified :: Nullable JSDate
  }

type ListObjectsV2Output =
  { contents :: Array S3Object
  , isTruncated :: Boolean
  , nextContinuationToken :: Nullable String
  , keyCount :: Int
  }

foreign import listObjectsV2Impl :: S3Client -> ListObjectsV2Input -> Effect (Promise ListObjectsV2Output)

-- | `client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken, MaxKeys }))`.
listObjectsV2 :: S3Client -> ListObjectsV2Input -> Aff ListObjectsV2Output
listObjectsV2 c i = toAffE (listObjectsV2Impl c i)

foreign import getSignedUrlImpl :: String -> S3Client -> String -> String -> Int -> Effect (Promise String)

-- | `getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn })`.
getSignedGetUrl :: S3Client -> String -> String -> Int -> Aff String
getSignedGetUrl c bucket key expiresIn = toAffE (getSignedUrlImpl "get" c bucket key expiresIn)

-- | `getSignedUrl(client, new PutObjectCommand({ Bucket, Key }), { expiresIn })`.
getSignedPutUrl :: S3Client -> String -> String -> Int -> Aff String
getSignedPutUrl c bucket key expiresIn = toAffE (getSignedUrlImpl "put" c bucket key expiresIn)

foreign import errorStatusCodeImpl :: Error -> Nullable Int

-- | `err.$metadata.httpStatusCode` of a rejected SDK call.
errorStatusCode :: Error -> Maybe Int
errorStatusCode = toMaybe <<< errorStatusCodeImpl

foreign import errorNameImpl :: Error -> Nullable String

-- | `err.name` (e.g. "NotFound", "NoSuchKey", "UnknownError").
errorName :: Error -> Maybe String
errorName = toMaybe <<< errorNameImpl

foreign import getObjectWithSignalImpl :: S3Client -> String -> String -> AbortSignal -> Effect (Promise (GetObjectOutput Buffer))
getObjectWithSignal :: S3Client -> String -> String -> AbortSignal -> Aff (GetObjectOutput Buffer)
getObjectWithSignal c bucket key signal = toAffE (getObjectWithSignalImpl c bucket key signal)

-- | Raw SDK result so callers can inspect Body and ContentRange before streaming.
foreign import getObjectRawImpl :: S3Client -> String -> String -> Nullable String -> Effect (Promise Foreign)
getObjectRaw :: S3Client -> String -> String -> Nullable String -> Aff Foreign
getObjectRaw c bucket key range = toAffE (getObjectRawImpl c bucket key range)
foreign import transformToWebStream :: Foreign -> Effect Foreign

foreign import putObjectWithMetadataImpl :: S3Client -> PutObjectInput Buffer -> Object String -> Effect (Promise Unit)
putObjectWithMetadata :: S3Client -> PutObjectInput Buffer -> Object String -> Aff Unit
putObjectWithMetadata c i metadata = toAffE (putObjectWithMetadataImpl c i metadata)
