-- | Bindings for `unstorage`: a `Storage` built from a custom driver.
module Unstorage
  ( Storage
  , Driver
  , DriverImpl
  , defineDriver
  , createStorage
  , getItem
  , setItem
  , hasItem
  , removeItem
  , getKeys
  , getMeta
  , Meta
  , clear
  ) where

import Prelude

import Control.Promise (Promise, fromAff, toAffE)
import Data.JSDate (JSDate)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import data Storage :: Type
foreign import data Driver :: Type

type Meta = { birthtime :: Nullable JSDate, mtime :: Nullable JSDate }

-- | The operations a driver implements. Values are raw strings.
type DriverImpl =
  { name :: String
  , hasItem :: String -> Aff Boolean
  , getItem :: String -> Aff (Maybe String)
  , setItem :: String -> String -> Aff Unit
  , removeItem :: String -> Aff Unit
  , getKeys :: String -> Aff (Array String)
  , getMeta :: String -> Aff (Maybe Meta)
  , clear :: Aff Unit
  , dispose :: Aff Unit
  }

type DriverRaw =
  { name :: String
  , hasItem :: String -> Effect (Promise Boolean)
  , getItem :: String -> Effect (Promise (Nullable String))
  , setItem :: String -> String -> Effect (Promise Unit)
  , removeItem :: String -> Effect (Promise Unit)
  , getKeys :: String -> Effect (Promise (Array String))
  , getMeta :: String -> Effect (Promise (Nullable Meta))
  , clear :: Effect (Promise Unit)
  , dispose :: Effect (Promise Unit)
  }

foreign import defineDriverImpl :: DriverRaw -> Driver

defineDriver :: DriverImpl -> Driver
defineDriver d = defineDriverImpl
  { name: d.name
  , hasItem: \k -> fromAff (d.hasItem k)
  , getItem: \k -> fromAff (toNullable <$> d.getItem k)
  , setItem: \k v -> fromAff (d.setItem k v)
  , removeItem: \k -> fromAff (d.removeItem k)
  , getKeys: \b -> fromAff (d.getKeys b)
  , getMeta: \k -> fromAff (toNullable <$> d.getMeta k)
  , clear: fromAff d.clear
  , dispose: fromAff d.dispose
  }

-- | `createStorage({ driver })`.
foreign import createStorage :: Driver -> Effect Storage

foreign import getItemImpl :: Storage -> String -> Effect (Promise (Nullable String))

getItem :: Storage -> String -> Aff (Maybe String)
getItem s k = toMaybe <$> toAffE (getItemImpl s k)

foreign import setItemImpl :: Storage -> String -> String -> Effect (Promise Unit)

setItem :: Storage -> String -> String -> Aff Unit
setItem s k v = toAffE (setItemImpl s k v)

foreign import hasItemImpl :: Storage -> String -> Effect (Promise Boolean)

hasItem :: Storage -> String -> Aff Boolean
hasItem s k = toAffE (hasItemImpl s k)

foreign import removeItemImpl :: Storage -> String -> Effect (Promise Unit)

removeItem :: Storage -> String -> Aff Unit
removeItem s k = toAffE (removeItemImpl s k)

foreign import getKeysImpl :: Storage -> String -> Effect (Promise (Array String))

getKeys :: Storage -> String -> Aff (Array String)
getKeys s b = toAffE (getKeysImpl s b)

foreign import getMetaImpl :: Storage -> String -> Effect (Promise (Nullable Meta))

getMeta :: Storage -> String -> Aff (Maybe Meta)
getMeta s k = toMaybe <$> toAffE (getMetaImpl s k)

foreign import clearImpl :: Storage -> Effect (Promise Unit)

clear :: Storage -> Aff Unit
clear s = toAffE (clearImpl s)
