-- | Bindings for the `cors` express middleware.
module Express.Cors (cors) where

import Prelude
import Effect (Effect)
import Express (App)

-- | `app.use(cors())`.
foreign import cors :: App -> Effect Unit
