-- | Bindings for `sharp`: image pipelines from a Buffer. A `Sharp` is a
-- | mutable pipeline, so every step is an `Effect` returning the same object.
module Sharp
  ( Sharp
  , fromBuffer
  , ResizeOptions
  , resize
  , toFormat
  , jpeg
  , webp
  , png
  , toBuffer
  , Metadata
  , metadata
  ) where

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Node.Buffer (Buffer)

foreign import data Sharp :: Type

-- | `sharp(buffer)`.
foreign import fromBuffer :: Buffer -> Effect Sharp

-- | `fit` is one of "cover" | "contain" | "fill" | "inside" | "outside".
type ResizeOptions =
  { width :: Nullable Int
  , height :: Nullable Int
  , fit :: Nullable String
  , withoutEnlargement :: Nullable Boolean
  }

-- | `.resize({ width, height, fit, withoutEnlargement })`.
foreign import resize :: Sharp -> ResizeOptions -> Effect Sharp

-- | `.toFormat(format)` ("jpeg" | "png" | "webp" | "avif" | …).
foreign import toFormat :: Sharp -> String -> Effect Sharp

-- | `.jpeg({ quality })`.
foreign import jpeg :: Sharp -> Nullable Int -> Effect Sharp

-- | `.webp({ quality })`.
foreign import webp :: Sharp -> Nullable Int -> Effect Sharp

-- | `.png()`.
foreign import png :: Sharp -> Effect Sharp

foreign import toBufferImpl :: Sharp -> Effect (Promise Buffer)

-- | `.toBuffer()`.
toBuffer :: Sharp -> Aff Buffer
toBuffer s = toAffE (toBufferImpl s)

type Metadata =
  { width :: Nullable Int
  , height :: Nullable Int
  , format :: Nullable String
  , size :: Nullable Int
  , hasAlpha :: Nullable Boolean
  }

foreign import metadataImpl :: Sharp -> Effect (Promise Metadata)

-- | `.metadata()`; rejects when the input is not an image sharp can read.
metadata :: Sharp -> Aff Metadata
metadata s = toAffE (metadataImpl s)
