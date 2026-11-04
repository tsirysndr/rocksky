module CI.Docker.Secret where

import Prelude
import CI.Docker.Types (Secret(..))
import Effect (Effect)

plaintext :: Secret -> Effect String
plaintext (Secret secret) = pure secret.value
