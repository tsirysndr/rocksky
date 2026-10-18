module Rocksky.Lib.DownloadImage (downloadImage, getContentType) where

import Prelude

import Axios as Axios
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect.Aff (Aff)
import Foreign.Object as Object
import Node.Buffer (Buffer)
import Rocksky.Lib.Foreign (unsafeFromForeign)

foreign import axiosGlobal :: Axios.Instance

getContentType :: String -> Aff (Maybe String)
getContentType url = do
  response <- Axios.head axiosGlobal url Axios.defaultRequestOptions
  pure case Object.lookup "content-type" (Axios.headers response) of
    Just "" -> Nothing
    other -> other

downloadImage :: Nullable String -> Aff (Maybe Buffer)
downloadImage url = case toMaybe url of
  Nothing -> pure Nothing
  Just "" -> pure Nothing
  Just u -> do
    response <- Axios.getWith axiosGlobal u Axios.defaultRequestOptions { responseType = toNullable (Just "arraybuffer") }
    pure (Just (unsafeFromForeign (Axios.data_ response)))
