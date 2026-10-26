module Rocksky.Feeds.Index where

import Prelude
import Effect (Effect)
import Hono.NodeServer as Server
import Pg as Pg
import Rocksky.Feeds.App as App
import Rocksky.Feeds.Env as Env
import Rocksky.Feeds.Telemetry as Telemetry

foreign import version :: Effect String
foreign import logPoolError :: forall a. a -> Effect Unit
foreign import installShutdown :: Server.Server -> Pg.Pool -> Effect Unit

main :: Effect Unit
main = do
  config <- Env.load
  pool <-
    Pg.createPool
      ( (Pg.defaultPoolConfig (Env.databaseUrl config))
          { max = 20
          , application_name = "rocksky-feeds:replica"
          , statement_timeout = 60000
          , idle_in_transaction_session_timeout = 30000
          }
      ) >>= Telemetry.instrumentPool
  Pg.onPoolError pool logPoolError
  db <- Pg.drizzleFromPool pool
  commit <- version
  app <- App.app
    { domain: config."ROCKSKY_FEEDGEN_DOMAIN"
    , version: commit
    , db
    , authenticate: App.defaultAuth
    }
  server <- Server.serve app config."ROCKSKY_FEEDGEN_PORT"
  installShutdown server pool
