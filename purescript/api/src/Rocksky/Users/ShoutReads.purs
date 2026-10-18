module Rocksky.Users.ShoutReads (register) where

import Prelude
import Axios as Axios
import Data.Array as A
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (aliasTable, groupBy, leftJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (columns, tableSQL, toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Users.Common as Common
import Foreign (Foreign)
import Foreign.Object as Object
import Unsafe.Coerce (unsafeCoerce)

field :: String -> Foreign -> Foreign
field key value = fromMaybe F.undefined (F.asObject value >>= Object.lookup key)

caller :: Context -> Hono.Context -> Aff (Maybe String)
caller ctx c = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> pure Nothing
  Just bearer -> do
    payload <- verifyToken ctx.db bearer
    rows <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (F.unsafeFromForeign (F.toForeign payload.did)))) # limit 1) :: Aff (Array { id :: String })
    pure (_.id <$> A.head rows)

shoutProjection :: Maybe String -> Boolean -> SQL.SQL
shoutProjection user profile = unsafeCoerce projected
  where
  base = F.toForeign
    { id: toSQL T.shoutsC.id, content: toSQL T.shoutsC.content
    , gifUrl: toSQL T.shoutsC.gifUrl, gifPreviewUrl: toSQL T.shoutsC.gifPreviewUrl
    , gifAlt: toSQL T.shoutsC.gifAlt, gifWidth: toSQL T.shoutsC.gifWidth, gifHeight: toSQL T.shoutsC.gifHeight, facets: toSQL T.shoutsC.facets
    , createdAt: toSQL T.shoutsC.createdAt, uri: toSQL T.shoutsC.uri, parent: toSQL T.shoutsC.parentId
    , likes: SQL.as "likes" (SQL.template ["count(", ")"] [toSQL T.shoutLikesC.id]) }
  exists table id = SQL.template ["EXISTS (SELECT 1 FROM ", " WHERE ", ".shout_id = ", ".xata_id AND ", ".user_id = ", ")"] [table, table, tableSQL T.shouts, table, SQL.string id]
  projected = case user of
    Nothing -> base
    Just id -> F.mergeForeign (F.mergeForeign base (F.toForeign { liked: SQL.as "liked" (exists (tableSQL T.shoutLikes) id) }))
      (if profile then F.toForeign { reported: SQL.as "reported" (exists (tableSQL T.shoutReports) id) } else F.toForeign {})

shoutGroups :: Array SQL.SQL
shoutGroups = [toSQL T.shoutsC.id, toSQL T.shoutsC.content, toSQL T.shoutsC.createdAt, toSQL T.shoutsC.uri, toSQL T.shoutsC.parentId
  , toSQL T.shoutsC.gifUrl, toSQL T.shoutsC.gifPreviewUrl, toSQL T.shoutsC.gifAlt, toSQL T.shoutsC.gifWidth, toSQL T.shoutsC.gifHeight, toSQL T.shoutsC.facets]
userGroups :: Array SQL.SQL
userGroups = [toSQL T.usersC.id, toSQL T.usersC.did, toSQL T.usersC.handle, toSQL T.usersC.displayName, toSQL T.usersC.avatar]

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  Common.get ctx app "/:did/app.rocksky.artist/:rkey/shouts" \c -> do
    user <- caller ctx c
    rows <- run ctx.db (selectFieldsFrom { shouts: shoutProjection user false, users: { id: toSQL T.usersC.id, did: toSQL T.usersC.did, handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar } } T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # leftJoin T.artists (SQL.eq (toSQL T.shoutsC.artistId) (toSQL T.artistsC.id))
      # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
      # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string (Common.uri c "artist")))
      # groupBy (shoutGroups <> userGroups) # orderBy [SQL.desc (toSQL T.shoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/app.rocksky.album/:rkey/shouts" \c -> do
    user <- caller ctx c
    rows <- run ctx.db (selectFieldsFrom { shouts: shoutProjection user false, users: { id: toSQL T.usersC.id, did: toSQL T.usersC.did, handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar } } T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # leftJoin T.albums (SQL.eq (toSQL T.shoutsC.albumId) (toSQL T.albumsC.id))
      # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
      # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string (Common.uri c "album")))
      # groupBy (shoutGroups <> userGroups) # orderBy [SQL.desc (toSQL T.shoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/app.rocksky.song/:rkey/shouts" \c -> do
    user <- caller ctx c
    rows <- run ctx.db (selectFieldsFrom { shouts: shoutProjection user false, users: { id: toSQL T.usersC.id, did: toSQL T.usersC.did, handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar } } T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # leftJoin T.tracks (SQL.eq (toSQL T.shoutsC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
      # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string (Common.uri c "song")))
      # groupBy (shoutGroups <> userGroups) # orderBy [SQL.desc (toSQL T.shoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/app.rocksky.scrobble/:rkey/shouts" \c -> do
    user <- caller ctx c
    rows <- run ctx.db (selectFieldsFrom { shouts: shoutProjection user false, users: { id: toSQL T.usersC.id, did: toSQL T.usersC.did, handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar } } T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # leftJoin T.scrobbles (SQL.eq (toSQL T.shoutsC.scrobbleId) (toSQL T.scrobblesC.id))
      # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
      # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string (Common.uri c "scrobble")))
      # groupBy (shoutGroups <> userGroups) # orderBy [SQL.desc (toSQL T.shoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/shouts" \c -> do
    user <- caller ctx c
    let authors = aliasTable T.users "authors"
    let a = columns authors
    let did = SQL.string (Hono.reqParam c "did")
    rows <- run ctx.db (selectFieldsFrom
      { profileShouts: { id: toSQL T.profileShoutsC.id, createdAt: toSQL T.profileShoutsC.createdAt }
      , shouts: shoutProjection user true
      , users: { id: toSQL a.id, did: toSQL a.did, handle: toSQL a.handle, displayName: toSQL a.displayName, avatar: toSQL a.avatar } } T.profileShouts
      # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) did) (SQL.eq (toSQL T.usersC.handle) did))
      # leftJoin T.shouts (SQL.eq (toSQL T.profileShoutsC.shoutId) (toSQL T.shoutsC.id))
      # leftJoin authors (SQL.eq (toSQL T.shoutsC.authorId) (toSQL a.id))
      # leftJoin T.users (SQL.eq (toSQL T.profileShoutsC.userId) (toSQL T.usersC.id))
      # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
      # groupBy ([toSQL T.profileShoutsC.id, toSQL T.profileShoutsC.createdAt] <> shoutGroups <> userGroups <> [toSQL a.id, toSQL a.did, toSQL a.handle, toSQL a.displayName, toSQL a.avatar])
      # orderBy [SQL.desc (toSQL T.profileShoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/app.rocksky.shout/:rkey/likes" \c -> do
    rows <- run ctx.db (selectFrom T.shoutLikes
      # leftJoin T.users (SQL.eq (toSQL T.shoutLikesC.userId) (toSQL T.usersC.id))
      # leftJoin T.shouts (SQL.eq (toSQL T.shoutLikesC.shoutId) (toSQL T.shoutsC.id))
      # where_ (SQL.eq (toSQL T.shoutsC.uri) (SQL.string (Common.uri c "shout")))) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/app.rocksky.shout/:rkey/replies" \c -> do
    rows <- run ctx.db (selectFrom T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.shoutsC.parentId) (SQL.string (Common.uri c "shout")))
      # orderBy [SQL.asc (toSQL T.shoutsC.createdAt)]) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.get ctx app "/:did/stats" \c -> do
    response <- Axios.post ctx.analytics "library.getStats" (F.toForeign { user_did: Hono.reqParam c "did" })
    let body = Axios.data_ response
    Rest.json c 200 (F.toForeign { scrobbles: field "scrobbles" body, artists: field "artists" body, lovedTracks: field "loved_tracks" body, albums: field "albums" body, tracks: field "tracks" body })
