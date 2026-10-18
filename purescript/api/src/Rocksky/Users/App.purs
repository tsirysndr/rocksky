module Rocksky.Users.App (app) where

import Prelude
import Effect (Effect)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Users.Details as Details
import Rocksky.Users.Library as Library
import Rocksky.Users.Moderation as Moderation
import Rocksky.Users.Mutations as Mutations
import Rocksky.Users.Profile as Profile
import Rocksky.Users.ShoutReads as ShoutReads

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Library.register ctx a
  Details.register ctx a
  Profile.register ctx a
  Mutations.register ctx a
  ShoutReads.register ctx a
  Moderation.register ctx a
  pure a
