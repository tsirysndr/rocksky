-- | Bindings for `chalk` (v5). Every style is `String -> String`.
module Chalk where

foreign import cyan :: String -> String
foreign import cyanBright :: String -> String
foreign import green :: String -> String
foreign import greenBright :: String -> String
foreign import magenta :: String -> String
foreign import magentaBright :: String -> String
foreign import yellow :: String -> String
foreign import yellowBright :: String -> String
foreign import red :: String -> String
foreign import redBright :: String -> String
foreign import gray :: String -> String
foreign import blue :: String -> String
foreign import white :: String -> String
foreign import bold :: String -> String
foreign import dim :: String -> String
foreign import underline :: String -> String
