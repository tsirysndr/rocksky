module Rocksky.Scripts.Exp (main) where

import Prelude
import Consola as Consola
import Effect (Effect)
import Effect.Class (liftEffect)
import NodeCron as Cron
import Rocksky.Auth.SessionMaintenance (updateExpiresAt, refreshSessionsAboutToExpire)
import Rocksky.Context (createContext)
import Rocksky.Lib.Env (env)
import Rocksky.Scripts.Common (runScript)

main :: Effect Unit
main = runScript do
  ctx <- createContext
  liftEffect (Consola.info ("DB Path: " <> env."DB_PATH"))
  updateExpiresAt ctx.sqliteDb
  refreshSessionsAboutToExpire ctx.sqliteDb ctx
  void (liftEffect (Cron.schedule "* * * * *" do
    liftEffect (Consola.info "Running session refresh job...")
    refreshSessionsAboutToExpire ctx.sqliteDb ctx))
