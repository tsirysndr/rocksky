module Rocksky.Scripts.BackfillJetstream (main) where

import Prelude
import Consola as Log
import Dotenv as Dotenv
import Effect (Effect)
import Effect.Class (liftEffect)
import Rocksky.Jetstream.Backfill as Backfill
import Rocksky.Scripts.Common (runScript)

main :: Effect Unit
main = runScript do
  liftEffect Dotenv.config
  opts <- liftEffect Backfill.options
  if opts.help then liftEffect (Log.info
    "Usage: bun run backfill:jetstream [--dry-run] [--limit N] [--batch-size N] [--after-seq N] [--before-seq N] [--service URL]\nRequires SUBMISSIONS_DATABASE_URL (Postgres queue initialized by rockskyd jetstream) and JETSTREAM_API_KEY for hosted archives. Defaults to the full archive and resumes its own durable checkpoint; exits at the sealed archive tip.")
  else Backfill.backfill opts
