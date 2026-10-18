-- | Bindings for the `dropbox` SDK: the `Dropbox` files client and
-- | `DropboxAuth` (OAuth code flow + refresh).
module Dropbox
  ( Dropbox
  , DropboxAuth
  , Options
  , new
  , newAuth
  , fromAuth
  , Entry
  , ListFolderInput
  , ListFolderResult
  , filesListFolder
  , filesListFolderContinue
  , filesGetMetadata
  , TemporaryLink
  , filesGetTemporaryLink
  , Download
  , filesDownload
  , AuthUrlInput
  , getAuthenticationUrl
  , TokenResult
  , getAccessTokenFromCode
  , refreshAccessToken
  , getAccessToken
  , setAccessToken
  , getRefreshToken
  , setRefreshToken
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Node.Buffer (Buffer)

foreign import data Dropbox :: Type
foreign import data DropboxAuth :: Type

-- | Shared by `new Dropbox(opts)` and `new DropboxAuth(opts)`. With a
-- | `refreshToken` + `clientId`/`clientSecret` the SDK refreshes expired
-- | access tokens itself.
type Options =
  { accessToken :: Nullable String
  , refreshToken :: Nullable String
  , clientId :: Nullable String
  , clientSecret :: Nullable String
  }

foreign import newDropbox :: Options -> Effect Dropbox

-- | `new Dropbox({ accessToken, refreshToken, clientId, clientSecret })`.
new :: Options -> Effect Dropbox
new = newDropbox

-- | `new DropboxAuth({ ... })`.
foreign import newAuth :: Options -> Effect DropboxAuth

-- | `new Dropbox({ auth })`: a files client sharing an auth object's tokens.
foreign import fromAuth :: DropboxAuth -> Effect Dropbox

-- | One `files.Metadata` entry; `tag` is `.tag`: "file" | "folder" | "deleted".
-- | `size`, `clientModified`, `serverModified`, `contentHash` and `rev` are
-- | only set on files; timestamps are ISO strings.
type Entry =
  { tag :: String
  , name :: String
  , id :: Nullable String
  , pathLower :: Nullable String
  , pathDisplay :: Nullable String
  , size :: Nullable Number
  , clientModified :: Nullable String
  , serverModified :: Nullable String
  , contentHash :: Nullable String
  , rev :: Nullable String
  }

-- | `path` is "" for the root.
type ListFolderInput =
  { path :: String
  , recursive :: Nullable Boolean
  , limit :: Nullable Int
  , includeDeleted :: Nullable Boolean
  }

type ListFolderResult =
  { entries :: Array Entry
  , cursor :: String
  , hasMore :: Boolean
  }

foreign import filesListFolderImpl :: Dropbox -> ListFolderInput -> Effect (Promise ListFolderResult)

-- | `dbx.filesListFolder({ path, recursive, limit, include_deleted })` → `.result`.
filesListFolder :: Dropbox -> ListFolderInput -> Aff ListFolderResult
filesListFolder d i = toAffE (filesListFolderImpl d i)

foreign import filesListFolderContinueImpl :: Dropbox -> String -> Effect (Promise ListFolderResult)

-- | `dbx.filesListFolderContinue({ cursor })` → `.result`.
filesListFolderContinue :: Dropbox -> String -> Aff ListFolderResult
filesListFolderContinue d cursor = toAffE (filesListFolderContinueImpl d cursor)

foreign import filesGetMetadataImpl :: Dropbox -> String -> Effect (Promise Entry)

-- | `dbx.filesGetMetadata({ path })` → `.result`; `path` may be an id ("id:…").
filesGetMetadata :: Dropbox -> String -> Aff Entry
filesGetMetadata d path = toAffE (filesGetMetadataImpl d path)

type TemporaryLink = { link :: String, metadata :: Entry }

foreign import filesGetTemporaryLinkImpl :: Dropbox -> String -> Effect (Promise TemporaryLink)

-- | `dbx.filesGetTemporaryLink({ path })` → `.result` (link valid 4 hours).
filesGetTemporaryLink :: Dropbox -> String -> Aff TemporaryLink
filesGetTemporaryLink d path = toAffE (filesGetTemporaryLinkImpl d path)

type Download = { metadata :: Entry, fileBinary :: Buffer }

foreign import filesDownloadImpl :: Dropbox -> String -> Effect (Promise Download)

-- | `dbx.filesDownload({ path })` → `.result` with the Node `fileBinary`.
filesDownload :: Dropbox -> String -> Aff Download
filesDownload d path = toAffE (filesDownloadImpl d path)

-- | `authType` "code" | "token" (default "code"); `tokenAccessType`
-- | "offline" to also get a refresh token.
type AuthUrlInput =
  { redirectUri :: String
  , state :: Nullable String
  , authType :: Nullable String
  , tokenAccessType :: Nullable String
  , scope :: Nullable (Array String)
  }

foreign import getAuthenticationUrlImpl :: DropboxAuth -> AuthUrlInput -> Effect (Promise String)

-- | `auth.getAuthenticationUrl(redirectUri, state, authType, tokenAccessType, scope)`.
getAuthenticationUrl :: DropboxAuth -> AuthUrlInput -> Aff String
getAuthenticationUrl a i = toAffE (getAuthenticationUrlImpl a i)

-- | The `/oauth2/token` response: `expiresIn` is seconds.
type TokenResult =
  { accessToken :: String
  , refreshToken :: Nullable String
  , expiresIn :: Nullable Number
  , tokenType :: Nullable String
  , scope :: Nullable String
  , uid :: Nullable String
  , accountId :: Nullable String
  }

foreign import getAccessTokenFromCodeImpl :: DropboxAuth -> String -> String -> Effect (Promise TokenResult)

-- | `auth.getAccessTokenFromCode(redirectUri, code)` → `.result`. Also stores
-- | the tokens on the auth object.
getAccessTokenFromCode :: DropboxAuth -> String -> String -> Aff TokenResult
getAccessTokenFromCode a redirectUri code = toAffE (getAccessTokenFromCodeImpl a redirectUri code)

foreign import refreshAccessTokenImpl :: DropboxAuth -> Effect (Promise Unit)

-- | `auth.refreshAccessToken()`; read the new token with `getAccessToken`.
refreshAccessToken :: DropboxAuth -> Aff Unit
refreshAccessToken a = toAffE (refreshAccessTokenImpl a)

-- | `auth.getAccessToken()`.
foreign import getAccessToken :: DropboxAuth -> Effect String

-- | `auth.setAccessToken(token)`.
foreign import setAccessToken :: DropboxAuth -> String -> Effect Unit

-- | `auth.getRefreshToken()`.
foreign import getRefreshToken :: DropboxAuth -> Effect String

-- | `auth.setRefreshToken(token)`.
foreign import setRefreshToken :: DropboxAuth -> String -> Effect Unit
