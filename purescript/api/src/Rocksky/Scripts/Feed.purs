module Rocksky.Scripts.Feed (main, collectInput, publish, Input, Questions) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (notNull)
import Data.String (Pattern(..), stripPrefix)
import Data.String.CodeUnits as CU
import Data.String.Regex (regex, test)
import Data.String.Regex.Flags (noFlags)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Prompts as Prompts
import Rocksky.Context (createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Scripts.Common (exit, requireAgent, resolveDid, runScript, scriptArgs)

type Input = { name :: String, description :: String, did :: String, rkey :: String }
type Questions = { text :: String -> Aff String, confirm :: Aff Boolean }

matches :: String -> String -> Boolean
matches pattern value = case regex pattern noFlags of
  Right re -> test re value
  Left _ -> false

collectInput :: Questions -> Aff (Maybe Input)
collectInput questions = do
  name <- questions.text "What is the feed name?"
  unless (CU.length name >= 3 && CU.length name <= 240) (throwError (error "Feed name must be between 3 and 240 characters."))
  description <- questions.text "Please provide a short description of the feed"
  when (CU.length description > 3000) (throwError (error "Description is too long. Maximum length is 3000 characters."))
  did <- questions.text "What is the feed DID?"
  unless (matches "^did:web:[a-zA-Z0-9_.-]{3,30}$" did) (throwError (error "Invalid DID format. It should start with 'did:web:' followed by 3 to 30 alphanumeric characters, underscores, hyphens, or periods."))
  rkey <- questions.text "What is the record key (rkey) for the feed?"
  unless (matches "^[a-zA-Z0-9_-]{3,30}$" rkey) (throwError (error "Invalid record key. Only alphanumeric characters, underscores, and hyphens are allowed. Length must be between 3 and 30 characters."))
  liftEffect do
    Log.info "Creating feed with the following details:"
    Log.info "---"
    Log.info ("Feed name: " <> name)
    Log.info ("Description: " <> description)
    Log.info ("DID: " <> did)
    Log.info ("Record key (rkey): " <> rkey)
  confirmed <- questions.confirm
  if confirmed then pure (Just { name, description, did, rkey })
  else liftEffect (Log.info "Feed creation cancelled.") *> pure Nothing

publish :: Api.Agent -> Input -> Aff String
publish agent input = do
  liftEffect (Log.info "Writing app.rocksky.feed.generator record...")
  repo <- liftEffect (Api.assertDid agent)
  createdAt <- liftEffect (Date.now >>= Date.toISOString)
  result <- Api.createRecord agent { repo, collection: "app.rocksky.feed.generator", rkey: notNull input.rkey, validate: true
    , record: F.toForeign { "$type": "app.rocksky.feed.generator", displayName: input.name, description: input.description, did: input.did, createdAt } }
  liftEffect do
    Log.info "Feed created successfully!"
    Log.info ("Record created at: " <> result.uri)
  pure result.uri

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  identifier <- case head args of
    Just value -> pure value
    Nothing -> do
      liftEffect do
        Log.error "Please provide user author identifier (handle or DID)."
        Log.info "Usage: node bin/run.js Rocksky.Scripts.Feed <handle|did>"
      exit 1
  input <- collectInput
    { text: \label -> Prompts.text label Nothing >>= case _ of
        Just value -> pure value
        Nothing -> throwError (error "Prompt returned no value")
    , confirm: fromMaybe false <$> Prompts.confirm "Do you want to proceed?" true }
  case input of
    Nothing -> exit 0
    Just value -> do
      did <- if isJust (stripPrefix (Pattern "did:plc:") identifier) || isJust (stripPrefix (Pattern "did:web:") identifier)
        then pure identifier else resolveDid ctx identifier
      agent <- requireAgent ctx did
      void (publish agent value)
      exit 0
