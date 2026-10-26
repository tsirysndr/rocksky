module Rocksky.Cli.Mpd.Protocol where

import Prelude
import Data.Array as Array
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), Replacement(..), replaceAll)
import Data.String.CodeUnits as CU

version :: String
version = "0.23.5"

greeting :: String
greeting = "OK MPD " <> version <> "\n"

ackLine :: Int -> Int -> String -> String -> String
ackLine code position command message = "ACK [" <> show code <> "@" <> show position <> "] {" <> command <> "} " <> message <> "\n"

kv :: String -> String -> String
kv key value = key <> ": " <> replaceAll (Pattern "\n") (Replacement " ") (replaceAll (Pattern "\r\n") (Replacement "\n") value) <> "\n"

tokenize :: String -> Array String
tokenize line = go (CU.toCharArray line) []
  where
  whitespace char = char == ' ' || char == '\t'
  go input tokens = case Array.uncons (Array.dropWhile whitespace input) of
    Nothing -> tokens
    Just { head: '"', tail } -> let result = quoted tail "" in go result.rest (Array.snoc tokens result.token)
    Just remaining ->
      let
        input_ = Array.cons remaining.head remaining.tail
        token = Array.takeWhile (not <<< whitespace) input_
        rest = Array.drop (Array.length token) input_
      in
        go rest (Array.snoc tokens (CU.fromCharArray token))
  quoted input token = case Array.uncons input of
    Nothing -> { token, rest: [] }
    Just { head: '"', tail } -> { token, rest: tail }
    Just { head: '\\', tail } -> case Array.uncons tail of
      Nothing -> { token: token <> "\\", rest: [] }
      Just next -> quoted next.tail (token <> CU.singleton next.head)
    Just next -> quoted next.tail (token <> CU.singleton next.head)
