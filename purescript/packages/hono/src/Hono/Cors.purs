-- | `hono/cors`.
module Hono.Cors (cors) where

import Prelude
import Effect (Effect)
import Hono (App)

-- | `app.use(cors())` with default options.
foreign import cors :: App -> Effect Unit
