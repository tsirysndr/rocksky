-- | Process-level setup shared by both entrypoints.
module Rocksky.Lib.Process (setDnsIpv4First, installCrashHandlers) where

import Prelude

import Effect (Effect)

-- | `dns.setDefaultResultOrder("ipv4first")`.
foreign import setDnsIpv4First :: Effect Unit

-- | Log unhandled rejections and uncaught exceptions instead of crashing.
foreign import installCrashHandlers :: Effect Unit
