module Rocksky.Cli.Parser where

import Prelude
import Control.Promise (Promise, fromAff, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Rocksky.Cli.Commands (CommandSpec)

type Invocation = { command :: String, arguments :: Array Foreign, options :: Foreign }

foreign import parseImpl :: String -> Array CommandSpec -> (Invocation -> Effect (Promise Unit)) -> Effect (Promise Unit)

parse :: String -> Array CommandSpec -> (Invocation -> Aff Unit) -> Aff Unit
parse version specs handler = toAffE (parseImpl version specs (fromAff <<< handler))
