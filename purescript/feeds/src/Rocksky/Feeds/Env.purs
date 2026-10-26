module Rocksky.Feeds.Env where

import Prelude
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Envalid as E

type Config =
  { "NODE_ENV" :: String
  , "ROCKSKY_FEEDGEN_DOMAIN" :: String
  , "ROCKSKY_FEEDGEN_PORT" :: Int
  , "XATA_POSTGRES_URL" :: String
  , "XATA_READ_POSTGRES_URL" :: String
  }

load :: Effect Config
load = E.cleanEnv
  { "NODE_ENV": E.strChoices [ "development", "production", "test" ] (E.defaults { default = Just "development" })
  , "ROCKSKY_FEEDGEN_DOMAIN": E.host (E.defaults { devDefault = Just "localhost" })
  , "ROCKSKY_FEEDGEN_PORT": E.port (E.defaults { devDefault = Just 8002 })
  , "XATA_POSTGRES_URL": E.str (E.defaults { devDefault = Just "postgresql://postgres:mysecretpassword@localhost:5433/rocksky?sslmode=disable" })
  , "XATA_READ_POSTGRES_URL": E.str (E.defaults { default = Just "" })
  }

databaseUrl :: Config -> String
databaseUrl config = if config."XATA_READ_POSTGRES_URL" == "" then config."XATA_POSTGRES_URL" else config."XATA_READ_POSTGRES_URL"
