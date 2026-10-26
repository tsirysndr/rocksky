module Rocksky.Cli.Command.Mcp (arguments) where

import Prelude
import Data.Array (concatMap)
import Data.String (trim)
import Foreign (Foreign)
import Rocksky.Cli.Client (field)

arguments :: Foreign -> Array String
arguments options = concatMap
  ( \{ key, flag } ->
      let
        value = trim (field key options)
      in
        if value == "" then [] else [ flag, value ]
  )
  [ { key: "device", flag: "--device" }
  , { key: "apiUrl", flag: "--api-url" }
  , { key: "wsUrl", flag: "--ws-url" }
  , { key: "tokenPath", flag: "--token-path" }
  ]
