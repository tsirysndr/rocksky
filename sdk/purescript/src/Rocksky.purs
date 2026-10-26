-- | Client configuration and generic XRPC calls. Endpoint-specific types and
-- | functions live under Rocksky.API.<Namespace>.<Method>.
module Rocksky (module Client) where

import Rocksky.Client (Client, Config, HttpError, RockskyError(..), defaultConfig, newClient, procedure, query, request, withToken) as Client
