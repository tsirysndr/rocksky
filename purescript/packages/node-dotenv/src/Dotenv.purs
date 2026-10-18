-- | Bindings for `dotenv`.
module Dotenv (config) where

import Prelude
import Effect (Effect)

-- | `dotenv.config()`: load `.env` into `process.env`.
foreign import config :: Effect Unit
