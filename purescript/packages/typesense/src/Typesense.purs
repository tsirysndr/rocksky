-- | Bindings for the `typesense` client.
module Typesense
  ( Client
  , Config
  , createClient
  , collectionExists
  , createCollection
  , deleteCollection
  , importDocuments
  , upsertDocument
  , deleteDocument
  , deleteDocumentsBy
  , search
  , multiSearch
  , SearchParams
  , defaultSearchParams
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable, null)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

foreign import data Client :: Type

type Config =
  { host :: String
  , port :: Int
  , protocol :: String
  , apiKey :: String
  , connectionTimeoutSeconds :: Int
  }

foreign import createClient :: Config -> Effect Client

foreign import collectionExistsImpl :: Client -> String -> Effect (Promise Boolean)

-- | `client.collections(name).retrieve()` succeeds.
collectionExists :: Client -> String -> Aff Boolean
collectionExists c n = toAffE (collectionExistsImpl c n)

foreign import createCollectionImpl :: Client -> Foreign -> Effect (Promise Unit)

-- | `client.collections().create(schema)`.
createCollection :: Client -> Foreign -> Aff Unit
createCollection c s = toAffE (createCollectionImpl c s)

foreign import deleteCollectionImpl :: Client -> String -> Effect (Promise Unit)

deleteCollection :: Client -> String -> Aff Unit
deleteCollection c n = toAffE (deleteCollectionImpl c n)

foreign import importDocumentsImpl :: Client -> String -> Array Foreign -> String -> Effect (Promise (Array Foreign))

-- | `client.collections(name).documents().import(docs, { action })`; returns
-- | the per-document results.
importDocuments :: Client -> String -> Array Foreign -> String -> Aff (Array Foreign)
importDocuments c n docs action = toAffE (importDocumentsImpl c n docs action)

foreign import upsertDocumentImpl :: Client -> String -> Foreign -> Effect (Promise Unit)

upsertDocument :: Client -> String -> Foreign -> Aff Unit
upsertDocument c n d = toAffE (upsertDocumentImpl c n d)

foreign import deleteDocumentImpl :: Client -> String -> String -> Effect (Promise Unit)

deleteDocument :: Client -> String -> String -> Aff Unit
deleteDocument c n id = toAffE (deleteDocumentImpl c n id)

foreign import deleteDocumentsByImpl :: Client -> String -> String -> Effect (Promise Unit)

-- | `documents().delete({ filter_by })`.
deleteDocumentsBy :: Client -> String -> String -> Aff Unit
deleteDocumentsBy c n f = toAffE (deleteDocumentsByImpl c n f)

type SearchParams =
  { q :: String
  , query_by :: String
  , filter_by :: Nullable String
  , sort_by :: Nullable String
  , per_page :: Nullable Int
  , page :: Nullable Int
  , prefix :: Nullable Boolean
  , num_typos :: Nullable Int
  , prioritize_exact_match :: Nullable Boolean
  , collection :: Nullable String
  }

defaultSearchParams :: String -> String -> SearchParams
defaultSearchParams q query_by =
  { q, query_by, filter_by: null, sort_by: null, per_page: null, page: null, prefix: null, num_typos: null, prioritize_exact_match: null, collection: null }

foreign import searchImpl :: Client -> String -> SearchParams -> Effect (Promise Foreign)

-- | `client.collections(name).documents().search(params)`.
search :: Client -> String -> SearchParams -> Aff Foreign
search c n p = toAffE (searchImpl c n p)

foreign import multiSearchImpl :: Client -> Array SearchParams -> Effect (Promise (Array Foreign))

-- | `client.multiSearch.perform({ searches })`; each search names its
-- | `collection`. Returns the `results` array.
multiSearch :: Client -> Array SearchParams -> Aff (Array Foreign)
multiSearch c ps = toAffE (multiSearchImpl c ps)
