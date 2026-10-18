module Rocksky.Scripts.Spotify (main, saveCredentials) where

import Prelude
import Consola as Consola
import Data.Array (index)
import Data.Maybe (Maybe(..))
import Drizzle.Builder (insert, onConflictDoNothing, runInsert)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Crypto (encrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, runScript, scriptArgs)

saveCredentials :: Context -> String -> String -> Aff Unit
saveCredentials ctx clientId clientSecret = do
  encrypted <- liftEffect (encrypt clientSecret env."SPOTIFY_ENCRYPTION_KEY")
  runInsert ctx.db (insert T.spotifyApps [{ spotifyAppId: clientId, spotifySecret: encrypted }] # onConflictDoNothing)

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  case index args 0, index args 1 of
    Just clientId, Just secret | clientId /= "" && secret /= "" -> saveCredentials ctx clientId secret *> exit 0
    _, _ -> do
      liftEffect do
        Consola.error "Please provide Spotify Client ID and Client Secret as command line arguments"
        Consola.info "Usage: node bin/run.js Rocksky.Scripts.Spotify <client_id> <client_secret>"
      exit 1
