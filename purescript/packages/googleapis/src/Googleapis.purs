-- | Bindings for `googleapis`: `google.auth.OAuth2` and the Drive v3 client
-- | (`files.list`, `files.get`, `files.create`, `about.get`).
module Googleapis
  ( OAuth2Client
  , OAuth2Config
  , newOAuth2
  , AuthUrlOptions
  , generateAuthUrl
  , Credentials
  , getToken
  , setCredentials
  , getCredentials
  , refreshAccessToken
  , Drive
  , drive
  , DriveFile
  , FilesListInput
  , FilesListOutput
  , filesList
  , FilesGetInput
  , filesGet
  , filesGetMedia
  , filesGetMediaStream
  , FilesCreateInput
  , filesCreate
  , aboutGet
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Node.Buffer (Buffer)
import Node.Stream (Readable)

foreign import data OAuth2Client :: Type
foreign import data Drive :: Type

type OAuth2Config = { clientId :: String, clientSecret :: String, redirectUri :: String }

-- | `new google.auth.OAuth2(clientId, clientSecret, redirectUri)`.
foreign import newOAuth2 :: OAuth2Config -> Effect OAuth2Client

-- | `accessType` "offline" for a refresh token; `prompt` "consent" to force
-- | the consent screen (Google only issues a refresh token the first time otherwise).
type AuthUrlOptions =
  { accessType :: Nullable String
  , prompt :: Nullable String
  , scope :: Array String
  , state :: Nullable String
  }

-- | `client.generateAuthUrl({ access_type, prompt, scope, state })`.
foreign import generateAuthUrl :: OAuth2Client -> AuthUrlOptions -> Effect String

-- | `expiryDate` is epoch milliseconds.
type Credentials =
  { accessToken :: Nullable String
  , refreshToken :: Nullable String
  , expiryDate :: Nullable Number
  , scope :: Nullable String
  , tokenType :: Nullable String
  , idToken :: Nullable String
  }

foreign import getTokenImpl :: OAuth2Client -> String -> Effect (Promise Credentials)

-- | `client.getToken(code)` → `.tokens` (the OAuth callback's code exchange).
getToken :: OAuth2Client -> String -> Aff Credentials
getToken c code = toAffE (getTokenImpl c code)

-- | `client.setCredentials({ access_token, refresh_token, expiry_date, ... })`.
foreign import setCredentials :: OAuth2Client -> Credentials -> Effect Unit

-- | `client.credentials`.
foreign import getCredentials :: OAuth2Client -> Effect Credentials

foreign import refreshAccessTokenImpl :: OAuth2Client -> Effect (Promise Credentials)

-- | `client.refreshAccessToken()` → `.credentials`; needs a refresh token set.
refreshAccessToken :: OAuth2Client -> Aff Credentials
refreshAccessToken c = toAffE (refreshAccessTokenImpl c)

-- | `google.drive({ version: "v3", auth })`.
foreign import drive :: OAuth2Client -> Effect Drive

-- | `size` is a decimal string in the Drive API; `modifiedTime` RFC 3339.
-- | Fields are only populated when requested via `fields`.
type DriveFile =
  { id :: String
  , name :: String
  , mimeType :: Nullable String
  , size :: Nullable String
  , parents :: Array String
  , modifiedTime :: Nullable String
  , md5Checksum :: Nullable String
  , webContentLink :: Nullable String
  , thumbnailLink :: Nullable String
  , trashed :: Nullable Boolean
  }

type FilesListInput =
  { q :: Nullable String
  , fields :: Nullable String
  , pageSize :: Nullable Int
  , pageToken :: Nullable String
  , orderBy :: Nullable String
  , spaces :: Nullable String
  }

type FilesListOutput = { files :: Array DriveFile, nextPageToken :: Nullable String }

foreign import filesListImpl :: Drive -> FilesListInput -> Effect (Promise FilesListOutput)

-- | `drive.files.list({ q, fields, pageSize, pageToken, orderBy, spaces })` → `.data`.
filesList :: Drive -> FilesListInput -> Aff FilesListOutput
filesList d i = toAffE (filesListImpl d i)

type FilesGetInput = { fileId :: String, fields :: Nullable String }

foreign import filesGetImpl :: Drive -> FilesGetInput -> Effect (Promise DriveFile)

-- | `drive.files.get({ fileId, fields })` → `.data` (metadata only).
filesGet :: Drive -> FilesGetInput -> Aff DriveFile
filesGet d i = toAffE (filesGetImpl d i)

foreign import filesGetMediaImpl :: Drive -> String -> Effect (Promise Buffer)

-- | `drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })`
-- | → the file content as a Buffer.
filesGetMedia :: Drive -> String -> Aff Buffer
filesGetMedia d fileId = toAffE (filesGetMediaImpl d fileId)

foreign import filesGetMediaStreamImpl :: Drive -> String -> Effect (Promise (Readable ()))

-- | `drive.files.get({ fileId, alt: "media" }, { responseType: "stream" })`
-- | → the content as a Node readable stream.
filesGetMediaStream :: Drive -> String -> Aff (Readable ())
filesGetMediaStream d fileId = toAffE (filesGetMediaStreamImpl d fileId)

-- | `mimeType` "application/vnd.google-apps.folder" creates a folder.
type FilesCreateInput =
  { name :: String
  , mimeType :: Nullable String
  , parents :: Array String
  , fields :: Nullable String
  }

foreign import filesCreateImpl :: Drive -> FilesCreateInput -> Effect (Promise DriveFile)

-- | `drive.files.create({ requestBody: { name, mimeType, parents }, fields })` → `.data`.
filesCreate :: Drive -> FilesCreateInput -> Aff DriveFile
filesCreate d i = toAffE (filesCreateImpl d i)

foreign import aboutGetImpl :: Drive -> String -> Effect (Promise Foreign)

-- | `drive.about.get({ fields })` → `.data` (e.g. fields "user, storageQuota").
aboutGet :: Drive -> String -> Aff Foreign
aboutGet d fields = toAffE (aboutGetImpl d fields)
