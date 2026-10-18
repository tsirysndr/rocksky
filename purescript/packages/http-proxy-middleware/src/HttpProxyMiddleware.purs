-- | Bindings for `http-proxy-middleware`.
module HttpProxyMiddleware (createProxyMiddleware) where

import Effect (Effect)
import Express (Router)

-- | `createProxyMiddleware({ target, changeOrigin: true })`.
foreign import createProxyMiddleware :: String -> Effect Router
