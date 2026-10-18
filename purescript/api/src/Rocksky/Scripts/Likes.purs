-- | `src/scripts/likes.ts`: republish every loved track on NATS.
module Rocksky.Scripts.Likes (main) where

import Prelude

import Chalk as Chalk
import Consola as Consola
import Data.Maybe (fromMaybe)
import Data.Nullable (toMaybe)
import Data.Traversable (for_)
import Drizzle.Query (runSelect, select)
import Effect (Effect)
import Effect.Class (liftEffect)
import Nats as Nats
import Rocksky.Context (createContext)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, isoString, publishJson, runScript)

main :: Effect Unit
main = runScript do
  ctx <- createContext
  likes <- runSelect ctx.db (select T.lovedTracks)
  for_ likes \like -> liftEffect do
    Consola.info ("Publishing like: " <> Chalk.cyanBright (fromMaybe "null" (toMaybe like.uri)))
    publishJson ctx "rocksky.like" $ toForeign
      { uri: like.uri
      , user_id: { xata_id: like.userId }
      , track_id: { xata_id: like.trackId }
      , xata_createdat: isoString like.createdAt
      , xata_id: like.id
      , xata_updatedat: isoString like.createdAt
      , xata_version: 0
      }
  Nats.flush ctx.nc
  liftEffect (Consola.info "Done")
  exit 0
