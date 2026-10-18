-- | Bindings for `prompts` (interactive CLI questions; scripts only).
module Prompts
  ( Question
  , Choice
  , prompt
  , promptWith
  , text
  , confirm
  , select
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, toNullable, null)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

type Choice = { title :: String, value :: Foreign, description :: Nullable String }

-- | `type` is one of "text" | "password" | "number" | "confirm" | "list" |
-- | "toggle" | "select" | "multiselect" | "autocomplete"; `choices` only for
-- | the select kinds.
type Question =
  { type :: String
  , name :: String
  , message :: String
  , initial :: Nullable Foreign
  , choices :: Nullable (Array Choice)
  }

foreign import promptImpl :: Question -> Nullable (Effect Unit) -> Effect (Promise (Nullable Foreign))

-- | `prompts(question)` → `answers[question.name]`; `Nothing` when the user
-- | aborted (Ctrl-C), in which case prompts leaves the answer undefined.
prompt :: Question -> Aff (Maybe Foreign)
prompt q = toMaybe <$> toAffE (promptImpl q null)

-- | `prompts(question, { onCancel })`.
promptWith :: Question -> Effect Unit -> Aff (Maybe Foreign)
promptWith q onCancel = toMaybe <$> toAffE (promptImpl q (toNullable (pure onCancel)))

foreign import toForeign :: forall a. a -> Foreign
foreign import unsafeFromForeign :: forall a. Foreign -> a

-- | A `{ type: "text" }` question with an optional initial value.
text :: String -> Maybe String -> Aff (Maybe String)
text message initial =
  map unsafeFromForeign <$> prompt
    { type: "text", name: "value", message, initial: toNullable (toForeign <$> initial), choices: null }

-- | A `{ type: "confirm" }` question with a default answer.
confirm :: String -> Boolean -> Aff (Maybe Boolean)
confirm message initial =
  map unsafeFromForeign <$> prompt
    { type: "confirm", name: "value", message, initial: toNullable (pure (toForeign initial)), choices: null }

-- | A `{ type: "select" }` question; resolves to the chosen `value`.
select :: String -> Array Choice -> Aff (Maybe Foreign)
select message choices =
  prompt { type: "select", name: "value", message, initial: null, choices: toNullable (pure choices) }
