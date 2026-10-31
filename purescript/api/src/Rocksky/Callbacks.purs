-- | Submission callbacks only, on a loopback port, so durable publication does
-- | not queue behind public traffic on the REST service. No public routes and
-- | no NATS subscribers: those stay with the REST service.
module Rocksky.Callbacks (main) where

import Prelude
import Data.Int as Int
import Data.Maybe (fromMaybe)
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Hono as Hono
import Hono.NodeServer as NodeServer
import Node.Process (lookupEnv)
import Rocksky.Context (createContext)
import Rocksky.Lib.Process (setDnsIpv4First)
import Rocksky.Otel as Otel
import Rocksky.Submissions.App as Submissions

main :: Effect Unit
main = do
  Otel.start
  setDnsIpv4First
  port <- fromMaybe 8099 <<< (_ >>= Int.fromString) <$> lookupEnv "SUBMISSIONS_CALLBACK_PORT"
  launchAff_ do
    ctx <- createContext
    liftEffect do
      a <- Hono.new
      Submissions.app ctx >>= Hono.route a "/internal/submissions"
      void (NodeServer.serveOn a "127.0.0.1" port)
      log ("Submission callbacks listening on 127.0.0.1:" <> show port)
