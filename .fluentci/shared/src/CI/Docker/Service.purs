module CI.Docker.Service where

import Prelude
import CI.Docker.Types
import CI.Docker.Engine as E
import Effect (Effect)

start :: Service -> Effect String
start service@(Service s) = let Container c = s.container in E.startService c.client service

stop :: Service -> Effect Unit
stop service@(Service s) = let Container c = s.container in E.stopService c.client service
