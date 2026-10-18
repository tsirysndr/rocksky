-- | Bindings for the `consola` logger. Each level takes a message and any
-- | number of extra values (`Foreign`), like `consola.info(msg, ...args)`.
module Consola
  ( info
  , infoF
  , error
  , errorF
  , warn
  , warnF
  , success
  , debug
  , debugF
  , start
  , box
  , LogObject
  , addReporter
  , setLevel
  ) where

import Prelude

import Effect (Effect)
import Effect.Uncurried (EffectFn1, EffectFn2, runEffectFn1, runEffectFn2)
import Foreign (Foreign)

foreign import logImpl :: EffectFn2 String (Array Foreign) Unit

info :: String -> Effect Unit
info m = runEffectFn2 logImpl "info" [ msg m ]

infoF :: String -> Array Foreign -> Effect Unit
infoF m xs = runEffectFn2 logImpl "info" ([ msg m ] <> xs)

error :: String -> Effect Unit
error m = runEffectFn2 logImpl "error" [ msg m ]

errorF :: String -> Array Foreign -> Effect Unit
errorF m xs = runEffectFn2 logImpl "error" ([ msg m ] <> xs)

warn :: String -> Effect Unit
warn m = runEffectFn2 logImpl "warn" [ msg m ]

warnF :: String -> Array Foreign -> Effect Unit
warnF m xs = runEffectFn2 logImpl "warn" ([ msg m ] <> xs)

success :: String -> Effect Unit
success m = runEffectFn2 logImpl "success" [ msg m ]

debug :: String -> Effect Unit
debug m = runEffectFn2 logImpl "debug" [ msg m ]

debugF :: String -> Array Foreign -> Effect Unit
debugF m xs = runEffectFn2 logImpl "debug" ([ msg m ] <> xs)

start :: String -> Effect Unit
start m = runEffectFn2 logImpl "start" [ msg m ]

box :: String -> Effect Unit
box m = runEffectFn2 logImpl "box" [ msg m ]

foreign import msg :: String -> Foreign

-- | What a reporter receives: `{ level, type, tag, args, date }`.
type LogObject =
  { level :: Int
  , type :: String
  , tag :: String
  , args :: Array Foreign
  }

foreign import addReporterImpl :: EffectFn1 (EffectFn1 LogObject Unit) Unit

addReporter :: (LogObject -> Effect Unit) -> Effect Unit
addReporter f = runEffectFn1 addReporterImpl (mkEffectFn1Impl f)

foreign import mkEffectFn1Impl :: forall a. (a -> Effect Unit) -> EffectFn1 a Unit

foreign import setLevel :: Int -> Effect Unit
