-- | Bindings for `ws`: the WebSocket client and `WebSocketServer`.
module Ws
  ( WebSocket
  , new
  , newWithHeaders
  , onOpen
  , onMessage
  , onMessageBuffer
  , onClose
  , onError
  , onPong
  , send
  , sendBuffer
  , ping
  , close
  , closeWith
  , terminate
  , readyState
  , ReadyState(..)
  , toReadyState
  , WebSocketServer
  , ServerOptions
  , newServer
  , onConnection
  , onServerError
  , onListening
  , clients
  , closeServer
  ) where

import Prelude

import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Exception (Error)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, mkEffectFn2, runEffectFn2)
import Foreign (Foreign)
import Foreign.Object (Object)
import Node.Buffer (Buffer)

foreign import data WebSocket :: Type
foreign import data WebSocketServer :: Type

foreign import newWebSocket :: String -> Effect WebSocket

-- | `new WebSocket(url)`.
new :: String -> Effect WebSocket
new = newWebSocket

-- | `new WebSocket(url, { headers })`.
foreign import newWithHeaders :: String -> Object String -> Effect WebSocket

foreign import onImpl :: forall f. String -> EffectFn2 WebSocket f Unit

-- | `ws.on("open", f)`.
onOpen :: WebSocket -> Effect Unit -> Effect Unit
onOpen ws f = runEffectFn2 (onImpl "open") ws (mkEffectFn1 \(_ :: Foreign) -> f)

foreign import onMessageImpl :: Boolean -> EffectFn2 WebSocket (EffectFn1 Foreign Unit) Unit

-- | `ws.on("message", f)` with the data decoded as a UTF-8 string.
onMessage :: WebSocket -> (String -> Effect Unit) -> Effect Unit
onMessage ws f = runEffectFn2 (onMessageImpl true) ws (mkEffectFn1 (f <<< unsafeFromForeign))

-- | `ws.on("message", f)` with the raw Buffer.
onMessageBuffer :: WebSocket -> (Buffer -> Effect Unit) -> Effect Unit
onMessageBuffer ws f = runEffectFn2 (onMessageImpl false) ws (mkEffectFn1 (f <<< unsafeFromForeign))

foreign import unsafeFromForeign :: forall a. Foreign -> a

-- | `ws.on("close", (code, reason) => ...)`; reason decoded as a string.
onClose :: WebSocket -> (Int -> String -> Effect Unit) -> Effect Unit
onClose ws f = runEffectFn2 (onImpl "close") ws (mkEffectFn2 \code reason -> f code (bufferToString reason))

foreign import bufferToString :: Foreign -> String

-- | `ws.on("error", f)`.
onError :: WebSocket -> (Error -> Effect Unit) -> Effect Unit
onError ws f = runEffectFn2 (onImpl "error") ws (mkEffectFn1 f)

-- | `ws.on("pong", f)`.
onPong :: WebSocket -> Effect Unit -> Effect Unit
onPong ws f = runEffectFn2 (onImpl "pong") ws (mkEffectFn1 \(_ :: Foreign) -> f)

-- | `ws.send(text)`.
foreign import send :: WebSocket -> String -> Effect Unit

-- | `ws.send(buffer)`.
foreign import sendBuffer :: WebSocket -> Buffer -> Effect Unit

-- | `ws.ping()`.
foreign import ping :: WebSocket -> Effect Unit

-- | `ws.close()`.
foreign import close :: WebSocket -> Effect Unit

-- | `ws.close(code, reason)`.
foreign import closeWith :: WebSocket -> Int -> String -> Effect Unit

-- | `ws.terminate()`: drop the connection without a close handshake.
foreign import terminate :: WebSocket -> Effect Unit

-- | `ws.readyState` (0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED).
foreign import readyState :: WebSocket -> Effect Int

data ReadyState = Connecting | Open | Closing | Closed

derive instance Eq ReadyState

toReadyState :: Int -> ReadyState
toReadyState = case _ of
  0 -> Connecting
  1 -> Open
  2 -> Closing
  _ -> Closed

-- | `noServer: true` to attach to an existing HTTP server via `handleUpgrade`
-- | (not bound); otherwise `port` (and `host`/`path`) start a listener.
type ServerOptions =
  { port :: Nullable Int
  , host :: Nullable String
  , path :: Nullable String
  , noServer :: Nullable Boolean
  }

-- | `new WebSocketServer(options)`.
foreign import newServer :: ServerOptions -> Effect WebSocketServer

foreign import onServerImpl :: forall f. String -> EffectFn2 WebSocketServer f Unit

-- | `wss.on("connection", (ws, req) => ...)`; `req` is the `http.IncomingMessage`.
onConnection :: WebSocketServer -> (WebSocket -> Foreign -> Effect Unit) -> Effect Unit
onConnection s f = runEffectFn2 (onServerImpl "connection") s (mkEffectFn2 f)

-- | `wss.on("error", f)`.
onServerError :: WebSocketServer -> (Error -> Effect Unit) -> Effect Unit
onServerError s f = runEffectFn2 (onServerImpl "error") s (mkEffectFn1 f)

-- | `wss.on("listening", f)`.
onListening :: WebSocketServer -> Effect Unit -> Effect Unit
onListening s f = runEffectFn2 (onServerImpl "listening") s (mkEffectFn1 \(_ :: Foreign) -> f)

-- | `[...wss.clients]`.
foreign import clients :: WebSocketServer -> Effect (Array WebSocket)

-- | `wss.close()`.
foreign import closeServer :: WebSocketServer -> Effect Unit
