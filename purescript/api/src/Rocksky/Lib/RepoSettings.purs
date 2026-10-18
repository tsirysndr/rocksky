-- | Shared repository access for audio settings and equalizer presets.
module Rocksky.Lib.RepoSettings where

import Prelude

import Atproto.Api as Api
import Control.Alt ((<|>))
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate (now, toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.String (Pattern(..), stripPrefix)
import Drizzle.Builder (limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Rocksky.Schema as T

resolveDid :: Context -> Maybe String -> Maybe String -> Aff String
resolveDid ctx requested caller = case requested <|> caller of
  Nothing -> throwError (error "No DID")
  Just "" -> throwError (error "No DID")
  Just did -> case stripPrefix (Pattern "did:") did of
    Just _ -> pure did
    Nothing -> do
      rows :: Array { did :: String } <- run ctx.db
        ( selectFieldsFrom { did: toSQL T.usersC.did } T.users
            # where_ (SQL.eq (toSQL T.usersC.handle) (SQL.string did))
            # limit 1
        )
      case head rows of
        Just user -> pure user.did
        Nothing -> throwError (error ("Handle not found: " <> did))

publicAgent :: Context -> String -> Aff Api.Agent
publicAgent ctx did = createAgent ctx did >>= case _ of
  Just agent -> pure agent
  Nothing -> do
    pds <- extractPdsFromDid did
    case pds of
      Just service -> liftEffect (Api.newAtpAgent service)
      Nothing -> throwError (error "PDS not found")

requireAgent :: Context -> Maybe String -> Aff { agent :: Api.Agent, did :: String }
requireAgent ctx caller = case caller of
  Nothing -> throwError (error "Unauthorized")
  Just "" -> throwError (error "Unauthorized")
  Just did -> createAgent ctx did >>= case _ of
    Nothing -> throwError (error "Could not create agent")
    Just agent -> pure { agent, did }

getExisting :: Api.Agent -> String -> String -> String -> Aff (Maybe Api.GetRecordOutput)
getExisting agent repo collection rkey = do
  result <- attempt (Api.getRecord agent { repo, collection, rkey })
  case result of
    Right record -> pure (Just record)
    Left err | Api.xrpcErrorStatus err == Just 400 || Api.xrpcErrorStatus err == Just 404 -> pure Nothing
    Left err -> throwError err

isRecord :: String -> Foreign -> Boolean
isRecord collection value = case readStringAt "$type" value of
  Just t -> t == collection || t == collection <> "#main"
  Nothing -> false

recordValue :: String -> Maybe Api.GetRecordOutput -> Foreign
recordValue collection existing = fromMaybe (toForeign {}) do
  rec <- existing
  if isRecord collection rec.value then Just rec.value else Nothing

swapRecord :: Maybe Api.GetRecordOutput -> Maybe (Maybe String)
swapRecord existing = Just <$> (existing >>= toMaybe <<< _.cid)

nowIso :: Aff String
nowIso = liftEffect (now >>= toISOString)
