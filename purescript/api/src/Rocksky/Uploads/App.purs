module Rocksky.Uploads.App (app) where

import Prelude
import Effect (Effect)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Uploads.Ingest as Ingest
import Rocksky.Uploads.Library as Library
import Rocksky.Uploads.Stream as Stream

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Ingest.register ctx a
  Library.register ctx a
  Stream.register ctx a
  pure a
