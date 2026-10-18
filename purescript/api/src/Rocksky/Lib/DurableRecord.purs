module Rocksky.Lib.DurableRecord (findDurableRecord, publishDurableRecord) where

import Prelude

import Atproto.Api (GetRecordOutput, RecordRef, xrpcErrorName)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff, attempt, throwError)

-- | Only a confirmed absence allows publication; a failed lookup is retryable.
findDurableRecord :: Aff GetRecordOutput -> Aff (Maybe String)
findDurableRecord lookup = do
  r <- attempt lookup
  case r of
    Right out -> pure (Just out.uri)
    Left e
      | xrpcErrorName e == Just "RecordNotFound" -> pure Nothing
      | otherwise -> throwError e

-- | The create callback MUST use the persisted rkey and swapRecord:null.
publishDurableRecord :: Aff RecordRef -> Aff GetRecordOutput -> Aff String
publishDurableRecord create lookup = do
  r <- attempt create
  case r of
    Right ref -> pure ref.uri
    Left e -> do
      -- A timeout can mean the write succeeded but its reply was lost.
      found <- findDurableRecord lookup
      case found of
        Just uri -> pure uri
        Nothing -> throwError e
