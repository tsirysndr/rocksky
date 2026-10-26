module Rocksky.Cli.Native.Integrations where

import Prelude
import Effect.Aff (Aff)
import Foreign (Foreign)
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

-- These adapters are loaded only when the corresponding integration is used.
tui :: Foreign -> Aff Unit
tui options = Runtime.invoke "tui" [ options ]

mpd :: Foreign -> Aff Unit
mpd options = Runtime.invoke "mpd" [ options ]

nfcStatus :: Aff Unit
nfcStatus = Runtime.invoke "nfc status" []

nfcRead :: Foreign -> Aff Unit
nfcRead options = Runtime.invoke "nfc read" [ options ]

nfcWrite :: Foreign -> Aff Unit
nfcWrite options = Runtime.invoke "nfc write" [ options ]

cardRead :: Aff Unit
cardRead = Runtime.invoke "card read" []

cardWrite :: Foreign -> Aff Unit
cardWrite options = Runtime.invoke "card write" [ options ]

upload :: Array String -> Foreign -> Aff Unit
upload files options = Runtime.invoke "upload" [ F.toForeign files, options ]
