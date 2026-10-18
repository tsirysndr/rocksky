module Rocksky.Types.Shout (Gif, Mention, Shout, parseShout, gifDecoder, mentionDecoder) where

import Prelude

import Data.Either (Either)
import Data.Maybe (Maybe, maybe, isJust)
import Data.String (trim)
import Data.String as String
import Foreign (Foreign)
import Rocksky.Lib.Validate (Decoder, FieldError, array, field, maxLength, nonNegativeInt, object, optional, refine, run, string, url)

type Gif = { url :: String, previewUrl :: Maybe String, alt :: Maybe String, width :: Maybe Int, height :: Maybe Int }

type Mention = { did :: String, byteStart :: Int, byteEnd :: Int }

type Shout = { message :: Maybe String, gif :: Maybe Gif, facets :: Maybe (Array Mention) }

gifDecoder :: Decoder Gif
gifDecoder = object \o -> { url: _, previewUrl: _, alt: _, width: _, height: _ }
  <$> field "url" (url string) o
  <*> optional "previewUrl" (url string) o
  <*> optional "alt" (maxLength 512 string) o
  <*> optional "width" nonNegativeInt o
  <*> optional "height" nonNegativeInt o

mentionDecoder :: Decoder Mention
mentionDecoder = object \o -> { did: _, byteStart: _, byteEnd: _ }
  <$> field "did" string o
  <*> field "byteStart" nonNegativeInt o
  <*> field "byteEnd" nonNegativeInt o

shoutDecoder :: Decoder Shout
shoutDecoder = refine hasContent "A shout must have a message or a gif." $ object \o ->
  { message: _, gif: _, facets: _ }
    <$> optional "message" (maxLength 1000 string) o
    <*> optional "gif" gifDecoder o
    <*> optional "facets" (array mentionDecoder) o
  where
  hasContent v = maybe 0 (String.length <<< trim) v.message > 0 || isJust v.gif

parseShout :: Foreign -> Either (Array FieldError) Shout
parseShout = run shoutDecoder
