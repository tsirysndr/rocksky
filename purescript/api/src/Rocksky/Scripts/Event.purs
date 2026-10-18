module Rocksky.Scripts.Event (main, collectInput, publish, imageType, uploadPoster, similarEvents, Input, Questions) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldM)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, null, notNull, toMaybe, toNullable)
import Data.String as S
import Data.String.CodeUnits as CU
import Data.Traversable (for_)
import Drizzle.Builder (innerJoin, limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Fetch as Fetch
import Fetch.URL as URL
import Foreign (Foreign)
import Foreign.Object as Object
import Prompts as Prompts
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, requireAgent, resolveDid, runScript, scriptArgs)
import Sharp as Sharp

type Questions = Prompts.Question -> Aff Foreign
type Input = { calendar :: Foreign, music :: Foreign, imageUrl :: Maybe String, name :: String }

calendarType :: String
calendarType = "community.lexicon.calendar.event"
musicType :: String
musicType = "app.rocksky.event.music"
optional :: String -> Foreign
optional s = if s == "" then F.undefined else F.toForeign s
question :: String -> String -> Prompts.Question
question type_ message = { type: type_, name: "value", message, initial: null, choices: null }
text :: Questions -> String -> Maybe String -> Aff String
text ask label initial = S.trim <<< fromMaybe "" <<< F.asString <$> ask ((question "text" label) { initial = toNullable (F.toForeign <$> initial) })
choose :: Questions -> String -> Array { title :: String, value :: String } -> Int -> Aff String
choose ask label choices initial = F.unsafeFromForeign <$> ask ((question "select" label) { initial = notNull (F.toForeign initial), choices = notNull (map (\c -> { title: c.title, value: F.toForeign c.value, description: null }) choices) })
confirm :: Questions -> String -> Boolean -> Aff Boolean
confirm ask label initial = F.truthy <$> ask ((question "confirm" label) { initial = notNull (F.toForeign initial) })
datetime :: Questions -> String -> Boolean -> Aff Foreign
datetime ask label required = do
  value <- text ask label Nothing
  if value == "" && not required then pure F.undefined else do
    date <- liftEffect (Date.parse value)
    if Date.isValid date then F.toForeign <$> liftEffect (Date.toISOString date) else do
      liftEffect (Log.warn "Not a date. Use ISO-8601, e.g. 2026-12-01T20:00:00+01:00")
      datetime ask label required

mimeTypes :: Object.Object String
mimeTypes = Object.fromHomogeneous { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" }
cleanType :: String -> String
cleanType = S.trim <<< fromMaybe "" <<< A.head <<< S.split (S.Pattern ";")
imageType :: String -> Aff (Maybe String)
imageType url = do
  parsed <- attempt (liftEffect (URL.create url))
  case parsed of
    Right u | URL.protocol u == "http:" || URL.protocol u == "https:" -> do
      response <- attempt (Fetch.fetchWith url (Fetch.defaultOptions { method = "HEAD" }))
      let fallback = A.last (S.split (S.Pattern ".") (S.toLower (URL.pathname u))) >>= flip Object.lookup mimeTypes
      pure case response of
        Right r -> case S.toLower <<< cleanType <$> Fetch.header r "content-type" of
          Just mime | A.elem mime (Object.values mimeTypes) -> Just mime
          Just mime | Fetch.ok r && mime /= "" -> Nothing
          _ -> fallback
        Left _ -> fallback
    _ -> pure Nothing

pictureUrl :: Questions -> Aff (Maybe String)
pictureUrl ask = do
  value <- text ask "Poster image URL (optional)" Nothing
  if value == "" then pure Nothing else do
    mime <- imageType value
    if isJust mime then pure (Just value) else do
      liftEffect (Log.warn "Not a picture URL. Expected a jpeg, png, webp, gif or avif image.")
      pictureUrl ask

artistUri :: Context -> String -> Aff (Maybe String)
artistUri ctx name = do
  rows <- run ctx.db (selectFieldsFrom { uri: T.artistsC.uri } T.artists # where_ (SQL.template ["lower(", ") = lower(", ")"] [toSQL T.artistsC.name, SQL.string name]) # limit 1) :: Aff (Array { uri :: Nullable String })
  pure (A.head rows >>= toMaybe <<< _.uri)

similarEvents :: Context -> String -> String -> Aff (Array { name :: String, uri :: String })
similarEvents ctx artist day = run ctx.db (selectFieldsFrom { name: T.eventsC.name, uri: T.eventsC.uri } T.events
  # innerJoin T.eventArtists (SQL.eq (toSQL T.eventArtistsC.eventId) (toSQL T.eventsC.id))
  # where_ (SQL.and (SQL.and (SQL.isNull (toSQL T.eventsC.duplicateOf)) (SQL.eq (toSQL T.eventArtistsC.position) (SQL.int 0)))
    (SQL.and (SQL.template ["lower(", ") = lower(", ")"] [toSQL T.eventArtistsC.name, SQL.string artist])
      (SQL.template ["to_char(", " AT TIME ZONE 'UTC', 'YYYY-MM-DD') = ", ""] [toSQL T.eventsC.startsAt, SQL.string day]))) # limit 5)

collectInput :: Context -> Questions -> Aff (Maybe Input)
collectInput ctx ask = do
  let txt label = text ask label Nothing
  name <- txt "Event name"
  when (name == "") (throwError (error "The event needs a name."))
  description <- optional <$> txt "Description (optional)"
  startsAt <- datetime ask "Starts at (ISO-8601)" true
  endsAt <- datetime ask "Ends at (ISO-8601, optional)" false
  mode <- choose ask "Attendance mode" (map (\c -> c { value = calendarType <> "#" <> c.value }) [{ title: "In person", value: "inperson" }, { title: "Virtual", value: "virtual" }, { title: "Hybrid", value: "hybrid" }]) 0
  status <- choose ask "Status" (map (\s -> { title: s, value: calendarType <> "#" <> S.toLower s }) ["Scheduled", "Planned", "Rescheduled", "Postponed", "Cancelled"]) 0
  locations <- if mode == calendarType <> "#virtual" then pure [] else do
    venue <- optional <$> txt "Venue name"
    country <- S.toUpper <$> txt "Country (ISO 3166 code, e.g. FR)"
    when (CU.length country < 2) (throwError (error "A venue needs at least a country code."))
    locality <- optional <$> txt "City (optional)"
    region <- optional <$> txt "Region / state (optional)"
    street <- optional <$> txt "Street address (optional)"
    postalCode <- optional <$> txt "Postal code (optional)"
    latitude <- txt "Latitude (optional)"
    longitude <- txt "Longitude (optional)"
    pure ([F.omitNulls (F.toForeign { "$type": "community.lexicon.location.address", name: venue, country, locality, region, street, postalCode })] <>
      if latitude /= "" && longitude /= "" then [F.omitNulls (F.toForeign { "$type": "community.lexicon.location.geo", name: venue, latitude, longitude })] else [])
  online <- if mode == calendarType <> "#inperson" then pure [] else do
    stream <- txt "Stream / online venue URL"
    pure (if stream == "" then [] else [F.toForeign { "$type": calendarType <> "#uri", uri: stream, name: "Online" }])
  website <- txt "Event website (optional)"
  let uris = if website == "" then [] else [{ uri: website, name: "Website" }]
  kind <- choose ask "Kind of event" [{title:"Concert",value:"concert"},{title:"Festival",value:"festival"},{title:"Club night",value:"club-night"},{title:"DJ set",value:"dj-set"},{title:"Livestream",value:"livestream"},{title:"Release party",value:"release-party"},{title:"Listening party",value:"listening-party"}] 0
  genre <- optional <$> txt "Main genre (optional)"
  rawTags <- ask (question "list" "Tags, comma-separated (optional)")
  let tags = A.filter (_ /= "") (map S.trim (F.unsafeFromForeign rawTags :: Array String))
  let lineup artists = do
        artistName <- txt (if A.null artists then "Artist name (headliner)" else "Next artist (leave empty to finish)")
        if artistName == "" then do
          when (A.null artists) (throwError (error "A music event needs at least one artist."))
          pure artists
        else do
          known <- artistUri ctx artistName
          uri <- optional <$> text ask "Artist AT-URI (optional)" known
          for_ known (\v -> liftEffect (Log.info ("Linked to " <> v)))
          role <- choose ask "Role" [{title:"Headliner",value:"headliner"},{title:"Support",value:"support"},{title:"Opener",value:"opener"},{title:"DJ",value:"dj"},{title:"Special guest",value:"special-guest"},{title:"Performer",value:"performer"}] (if A.null artists then 0 else 1)
          stage <- if kind == "festival" then optional <$> txt "Stage (optional)" else pure F.undefined
          setTime <- datetime ask "Set time (ISO-8601, optional)" false
          mbid <- optional <$> txt "MusicBrainz artist id (optional)"
          lineup (A.snoc artists (F.omitNulls (F.toForeign { name: artistName, uri, role, stage, startsAt: setTime, mbid })))
  artists <- lineup []
  externalIds <- foldM (\ids item -> do
    value <- txt (item.label <> " event id (optional)")
    pure (if value == "" then ids else Object.insert item.key value ids)) Object.empty
    [{key:"ticketmaster",label:"Ticketmaster"},{key:"songkick",label:"Songkick"},{key:"bandsintown",label:"Bandsintown"},{key:"residentAdvisor",label:"Resident Advisor"},{key:"setlistfm",label:"setlist.fm"},{key:"dice",label:"DICE"},{key:"eventbrite",label:"Eventbrite"}]
  ticketsUrl <- optional <$> txt "Tickets URL (optional)"
  imageUrl <- pictureUrl ask
  let headliner = fromMaybe "" (A.head artists >>= F.readStringAt "name")
  let day = CU.take 10 (F.unsafeFromForeign startsAt)
  similar <- similarEvents ctx headliner day
  proceed <- if A.null similar then pure true else do
    liftEffect (Log.warn (headliner <> " already has an event on " <> day <> "; this one will be folded onto it as a duplicate:"))
    for_ similar (\e -> liftEffect (Log.warn ("  " <> e.name <> "  " <> e.uri)))
    confirm ask "Publish anyway?" false
  if not proceed then pure Nothing else do
    createdAt <- liftEffect (Date.now >>= Date.toISOString)
    let calendar = F.omitNulls (F.toForeign { "$type": calendarType, name, description, createdAt, startsAt, endsAt, mode, status, locations: locations <> online, uris })
    let preview = F.omitNulls (F.toForeign { "$type": musicType, kind, genre, tags, artists, externalIds, ticketsUrl, imageUrl: toNullable imageUrl })
    liftEffect do
      Log.info "Creating event with the following details:"
      Log.info (F.stringifyPretty calendar)
      Log.info (F.stringifyPretty preview)
    approved <- confirm ask "Do you want to proceed?" true
    let music = F.omitNulls (F.mergeForeign preview (F.toForeign { createdAt, tags: if A.null tags then F.undefined else F.toForeign tags, externalIds: if Object.isEmpty externalIds then F.undefined else F.toForeign externalIds }))
    pure (if approved then Just { calendar, music, imageUrl, name } else Nothing)

uploadPoster :: Api.Agent -> String -> String -> Aff (Maybe Foreign)
uploadPoster agent name url = do
  liftEffect (Log.info ("Downloading poster " <> url <> "..."))
  response <- Fetch.fetch url
  if not (Fetch.ok response) then do
    liftEffect (Log.warn ("Poster download failed (" <> show (Fetch.status response) <> "); publishing without it."))
    pure Nothing
  else do
    bytes <- Fetch.arrayBuffer response
    metadata <- liftEffect (Sharp.fromBuffer bytes) >>= Sharp.metadata
    case toMaybe metadata.width, toMaybe metadata.height, toMaybe metadata.format of
      Just width, Just height, Just format | width /= 0 && height /= 0 && format /= "" -> do
        let supplied = fromMaybe "" (cleanType <$> Fetch.header response "content-type")
        let mime = if supplied /= "" then supplied else "image/" <> if format == "jpg" then "jpeg" else format
        blob <- Api.uploadBlob agent bytes mime
        pure (Just (F.toForeign { "$type": calendarType <> "#media", role: "thumbnail", alt: name, content: blob, aspect_ratio: { width, height } }))
      _, _, _ -> do
        liftEffect (Log.warn "Poster is not an image sharp can read; publishing without it.")
        pure Nothing

publish :: Api.Agent -> Input -> Aff { calendar :: Api.RecordRef, music :: Api.RecordRef }
publish agent input = do
  media <- case input.imageUrl of
    Nothing -> pure Nothing
    Just url -> uploadPoster agent input.name url
  let record = case media of
        Nothing -> input.calendar
        Just value -> F.mergeForeign input.calendar (F.toForeign { media: [value] })
  repo <- liftEffect (Api.assertDid agent)
  calendar <- Api.createRecord agent { repo, collection: calendarType, record, rkey: null, validate: true }
  music <- Api.createRecord agent { repo, collection: musicType, record: F.mergeForeign input.music (F.toForeign { subject: { uri: calendar.uri, cid: calendar.cid } }), rkey: null, validate: true }
  liftEffect do
    Log.info "Event created successfully!"
    Log.info ("Record created at: " <> music.uri)
    Log.info ("Delete the " <> musicType <> " record to remove the event from Rocksky; the calendar event stays yours.")
  pure { calendar, music }

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  identifier <- case A.head args of
    Just value -> pure value
    Nothing -> throwError (error "Please provide the publisher identifier (handle or DID). Usage: node bin/run.js Rocksky.Scripts.Event <handle|did>")
  let ask q = Prompts.prompt q >>= case _ of
        Just value -> pure value
        Nothing -> liftEffect (Log.info "Event creation cancelled.") *> exit 0
  input <- collectInput ctx ask
  case input of
    Nothing -> liftEffect (Log.info "Event creation cancelled.") *> exit 0
    Just value -> do
      did <- if isJust (S.stripPrefix (S.Pattern "did:") identifier) then pure identifier else resolveDid ctx identifier
      agent <- requireAgent ctx did
      void (publish agent value)
      exit 0
