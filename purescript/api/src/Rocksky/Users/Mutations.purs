module Rocksky.Users.Mutations where

import Prelude
import Atproto.Api (Agent)
import Data.Array as A
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Traversable (for_)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Lovedtracks.Service as Loved
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Shouts.Service as Shouts
import Rocksky.Types.Shout (Shout, parseShout)
import Rocksky.Types.Track (Track)
import Rocksky.Users.Common as Common

type Operations =
  { agent :: String -> Aff (Maybe Agent)
  , create :: Shout -> String -> SelectUser -> Agent -> Aff Unit
  , reply :: Shout -> String -> SelectUser -> Agent -> Aff Unit
  , likeShout :: String -> SelectUser -> Agent -> Aff Unit
  , unlikeShout :: String -> SelectUser -> Agent -> Aff Unit
  , likeTrack :: Foreign -> SelectUser -> Agent -> Aff Unit
  , unlikeTrack :: String -> SelectUser -> Agent -> Aff Unit
  }
operations :: Context -> Operations
operations ctx = { agent: createAgent ctx, create: Shouts.createShout ctx, reply: Shouts.replyShout ctx, likeShout: Shouts.likeShout ctx, unlikeShout: Shouts.unlikeShout ctx
  , likeTrack: \track user agent -> void (Loved.likeTrack ctx (F.unsafeFromForeign track :: Track) user agent), unlikeTrack: Loved.unLikeTrack ctx }

withActor :: Context -> Operations -> Hono.Context -> (SelectUser -> Agent -> Aff Hono.Response) -> Aff Hono.Response
withActor ctx ops c action = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> Rest.text c 401 "Unauthorized"
  Just bearer -> do
    payload <- verifyToken ctx.db bearer
    agent <- ops.agent (F.unsafeFromForeign (F.toForeign payload.did))
    users <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (F.unsafeFromForeign (F.toForeign payload.did)))) # limit 1) :: Aff (Array SelectUser)
    case A.head users of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just user -> action user (fromMaybe (F.unsafeFromForeign F.undefined) agent)

trackPayload :: Foreign -> Foreign
trackPayload track = F.toForeign
  { title: field "title", artist: field "artist", album: field "album", albumArt: field "albumArt", albumArtist: field "albumArtist"
  , trackNumber: field "trackNumber", duration: field "duration", composer: field "composer", lyrics: field "lyrics", discNumber: field "discNumber" }
  where
  field name = fromMaybe F.undefined (F.asObject track >>= Object.lookup name)

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx (operations ctx)
registerWith :: Context -> Operations -> Hono.App -> Effect Unit
registerWith ctx ops app = do
  let route method path handler = (if method == "POST" then Hono.post else Hono.delete) app path \c -> do
        liftEffect (Metrics.count ctx.metrics method ("/users" <> path))
        withActor ctx ops c (handler c)
  let parse c action = do
        body <- Hono.reqJson c
        case parseShout body of
          Left errors -> Rest.text c 400 ("Invalid shout data: " <> formatZodLike errors)
          Right shout -> action shout
  for_ ["artist", "album", "song", "scrobble"] \kind ->
    route "POST" ("/:did/app.rocksky." <> kind <> "/:rkey/shouts") \c user agent -> parse c \shout -> do
      ops.create shout (Common.uri c kind) user agent
      Rest.json c 200 (F.toForeign {})
  route "POST" "/:did/shouts" \c user agent -> parse c \shout -> do
    let did = Hono.reqParam c "did"
    targets <- run ctx.db (selectFrom T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))) # limit 1) :: Aff (Array { did :: String })
    case A.head targets of
      Nothing -> Rest.text c 404 "User not found"
      Just target -> do
        ops.create shout ("at://" <> target.did) user agent
        Rest.json c 200 (F.toForeign {})
  for_ ["POST", "DELETE"] \method -> do
    route method "/:did/app.rocksky.shout/:rkey/likes" \c user agent -> do
      (if method == "POST" then ops.likeShout else ops.unlikeShout) (Common.uri c "shout") user agent
      Rest.json c 200 (F.toForeign {})
    for_ [false, true] \byId -> route method (if byId then "/tracks/:trackId/likes" else "/:did/app.rocksky.song/:rkey/likes") \c user agent -> do
      rows <- run ctx.db (selectFrom T.tracks # where_ (SQL.eq
        (if byId then toSQL T.tracksC.id else toSQL T.tracksC.uri)
        (SQL.string (if byId then Hono.reqParam c "trackId" else Common.uri c "song"))) # limit 1) :: Aff (Array {})
      case A.head rows of
        Nothing | byId || method == "DELETE" -> Rest.text c 404 "Track not found"
        _ -> do
          -- Source URI POST lacks a missing-row guard; keep its failure response.
          row <- Rest.firstRow rows
          let track = F.toForeign row
          if method == "POST" then do
            ops.likeTrack (trackPayload track) user agent
            Rest.json c 200 (F.toForeign {})
          else do
            ops.unlikeTrack (F.unsafeFromForeign (fromMaybe F.undefined (F.path "sha256" track))) user agent
            Rest.json c 200 (F.toForeign ([] :: Array Foreign))
  route "POST" "/:did/app.rocksky.shout/:rkey/replies" \c user agent -> parse c \shout -> do
    ops.reply shout (Common.uri c "shout") user agent
    Rest.json c 200 (F.toForeign {})
