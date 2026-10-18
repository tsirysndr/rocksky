module Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid) where

import Prelude

import Data.Array (find)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), drop, stripPrefix)
import Data.String as String
import Effect.Aff (Aff, error, throwError)
import Fetch as Fetch
import Rocksky.Lib.Foreign (readArrayAt, readStringAt)
import Rocksky.Lib.Plc (plcDirectoryUrl)

-- | The `#atproto_pds` service endpoint of a DID document.
extractPdsFromDid :: String -> Aff (Maybe String)
extractPdsFromDid did = do
  didDocUrl <- case stripPrefix (Pattern "did:plc:") did, stripPrefix (Pattern "did:web:") did of
    Just _, _ -> pure (plcDirectoryUrl <> "/" <> did)
    _, Just domain -> pure ("https://" <> domain <> "/.well-known/did.json")
    _, _ -> throwError (error "Unsupported DID method")
  res <- Fetch.fetch didDocUrl
  unless (Fetch.ok res) $ throwError (error "Failed to fetch DID doc")
  doc <- Fetch.json res
  let
    services = fromMaybe [] (readArrayAt "service" doc)
    isPds s = readStringAt "type" s == Just "AtprotoPersonalDataServer"
      && fromMaybe false (map (endsWith "#atproto_pds") (readStringAt "id" s))
  pure (find isPds services >>= readStringAt "serviceEndpoint")
  where
  endsWith suffix s = drop (String.length s - String.length suffix) s == suffix
