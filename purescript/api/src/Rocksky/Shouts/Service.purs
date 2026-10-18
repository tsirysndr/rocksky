module Rocksky.Shouts.Service where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Atproto.Lexicon as Lexicon
import Control.Alt ((<|>))
import Control.Parallel (parSequence_)
import Data.Array (elem, head, null, nub)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.String (Pattern(..), contains, stripPrefix)
import Data.Traversable (for_)
import Drizzle.Builder (deleteFrom, innerJoin, insertForeign, leftJoin, limit, run, runDelete, runInsert, runInsertReturning, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Foreign (mergeForeign, omitNulls, readStringAt, toForeign)
import Rocksky.Lib.Plc (plcDirectoryUrl)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Notifications.Service (createNotification)
import Rocksky.Playlists.Service (atUriRepo, rkeyOf)
import Rocksky.Schema as T
import Rocksky.Schema.Shouts (SelectShout)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Types.Shout (Shout, Gif, Mention)

shoutCollection :: String
shoutCollection = "app.rocksky.shout"

nonempty :: Maybe String -> Maybe String
nonempty value = value >>= \s -> if s == "" then Nothing else Just s

facetsOf :: Shout -> Maybe (Array Mention)
facetsOf shout = shout.facets >>= \facets -> if null facets then Nothing else Just facets

gifRecord :: Gif -> Foreign
gifRecord gif = omitNulls (toForeign { url: gif.url, previewUrl: toNullable gif.previewUrl, alt: toNullable gif.alt, width: toNullable gif.width, height: toNullable gif.height })

shoutFields :: Shout -> Foreign
shoutFields shout = omitNulls (toForeign { message: toNullable (nonempty shout.message), gif: toNullable (gifRecord <$> shout.gif), facets: toNullable (facetsOf shout) })

storageFields :: Shout -> Foreign
storageFields shout = toForeign
  { content: fromMaybe "" shout.message
  , gifUrl: toNullable (_.url <$> shout.gif)
  , gifPreviewUrl: toNullable (shout.gif >>= _.previewUrl)
  , gifAlt: toNullable (shout.gif >>= _.alt)
  , gifWidth: toNullable (shout.gif >>= _.width)
  , gifHeight: toNullable (shout.gif >>= _.height)
  , facets: toNullable (facetsOf shout) }

validate :: Context -> String -> Foreign -> String -> Aff Unit
validate ctx collection record message = case Lexicon.validateRecord ctx.lexicons collection record of
  Right _ -> pure unit
  Left _ -> throwError (error message)

strongRef :: Context -> String -> Nullable String -> String -> Aff Foreign
strongRef ctx uri cid message = do
  let ref = toForeign { uri, cid }
  case Lexicon.validate ctx.lexicons "com.atproto.repo.strongRef" ref of
    Right _ -> pure ref
    Left _ -> throwError (error message)

-- The source resolves these refs through the first PLC service endpoint.
remoteRef :: Context -> String -> String -> String -> Aff Foreign
remoteRef ctx uri collection message = do
  let repo = atUriRepo uri
  doc <- Fetch.fetch (plcDirectoryUrl <> "/" <> repo) >>= Fetch.json
  agent <- liftEffect (Api.newAtpAgent (fromMaybe "" (readStringAt "service.0.serviceEndpoint" doc)))
  record <- Api.getRecord agent { repo, collection, rkey: rkeyOf uri }
  strongRef ctx uri record.cid message

notifyMentions :: Context -> Maybe (Array Mention) -> String -> String -> String -> Array String -> Aff Unit
notifyMentions ctx facets actorId shoutId subjectUri skip = do
  let dids = nub (map _.did (fromMaybe [] facets))
  unless (null dids) do
    users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.inArray (toSQL T.usersC.did) (map SQL.string dids)))
    for_ users \user -> unless (elem user.id skip) $ void $ createNotification ctx
      { userId: notNull user.id, actorId: notNull actorId, type: "mention", shoutId: notNull shoutId, subjectUri: notNull subjectUri }

type Subject =
  { collection :: String, uri :: Maybe String, trackId :: Maybe String, albumId :: Maybe String
  , artistId :: Maybe String, scrobbleId :: Maybe String, ownerId :: Maybe String, profileDid :: Maybe String }

emptySubject :: String -> Subject
emptySubject collection = { collection, uri: Nothing, trackId: Nothing, albumId: Nothing, artistId: Nothing, scrobbleId: Nothing, ownerId: Nothing, profileDid: Nothing }

resolveSubject :: Context -> String -> Aff Subject
resolveSubject ctx uri
  | contains (Pattern "app.rocksky.song") uri = do
      rows :: Array { id :: String, uri :: Nullable String } <- run ctx.db (selectFieldsFrom { id: toSQL T.tracksC.id, uri: toSQL T.tracksC.uri } T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string uri)) # limit 1)
      pure ((emptySubject "app.rocksky.song") { trackId = _.id <$> head rows, uri = head rows >>= toMaybe <<< _.uri })
  | contains (Pattern "app.rocksky.album") uri = do
      rows :: Array { id :: String, uri :: Nullable String } <- run ctx.db (selectFieldsFrom { id: toSQL T.albumsC.id, uri: toSQL T.albumsC.uri } T.albums # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string uri)) # limit 1)
      pure ((emptySubject "app.rocksky.album") { albumId = _.id <$> head rows, uri = head rows >>= toMaybe <<< _.uri })
  | contains (Pattern "app.rocksky.artist") uri = do
      rows :: Array { id :: String, uri :: Nullable String } <- run ctx.db (selectFieldsFrom { id: toSQL T.artistsC.id, uri: toSQL T.artistsC.uri } T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string uri)) # limit 1)
      pure ((emptySubject "app.rocksky.artist") { artistId = _.id <$> head rows, uri = head rows >>= toMaybe <<< _.uri })
  | contains (Pattern "app.rocksky.scrobble") uri = do
      rows :: Array { id :: String, uri :: Nullable String, userId :: Nullable String } <- run ctx.db
        (selectFieldsFrom { id: toSQL T.scrobblesC.id, uri: toSQL T.scrobblesC.uri, userId: toSQL T.scrobblesC.userId } T.scrobbles
          # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
          # innerJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id))
          # innerJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
          # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri)) # limit 1)
      pure ((emptySubject "app.rocksky.scrobble") { scrobbleId = _.id <$> head rows, uri = head rows >>= toMaybe <<< _.uri, ownerId = head rows >>= toMaybe <<< _.userId })
  | otherwise = do
      rows :: Array { id :: String, did :: String } <- run ctx.db
        (selectFieldsFrom { id: toSQL T.usersC.id, did: toSQL T.usersC.did } T.users
          # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (fromMaybe uri (stripPrefix (Pattern "at://") uri)))) # limit 1)
      pure ((emptySubject "app.bsky.actor.profile") { ownerId = _.id <$> head rows, profileDid = _.did <$> head rows })

subjectFields :: Subject -> Foreign
subjectFields s = omitNulls (toForeign { trackId: toNullable s.trackId, albumId: toNullable s.albumId, artistId: toNullable s.artistId, scrobbleId: toNullable s.scrobbleId })

createShout :: Context -> Shout -> String -> SelectUser -> Api.Agent -> Aff Unit
createShout ctx shout uri user agent = do
  subject <- resolveSubject ctx uri
  repo <- liftEffect (Api.assertDid agent)
  let subjectUri = fromMaybe "self" (nonempty subject.uri)
  existing <- Api.getRecord agent { repo, collection: subject.collection, rkey: if subjectUri == "self" then "self" else rkeyOf subjectUri }
  ref <- strongRef ctx existing.uri existing.cid "Invalid ref"
  rkey <- liftEffect tidNextStr
  createdAt <- nowIso
  let record = mergeForeign (shoutFields shout) (toForeign { "$type": shoutCollection, subject: ref, createdAt })
  validate ctx shoutCollection record "[shout] invalid record"
  recoverWith unit do
    created <- Api.createRecord agent { repo, collection: shoutCollection, rkey: notNull rkey, record, validate: false }
    rows :: Array SelectShout <- runInsertReturning ctx.db (insertForeign T.shouts [mergeForeign (mergeForeign (storageFields shout) (subjectFields subject)) (toForeign { uri: created.uri, authorId: user.id })])
    row <- requireRow "Shout insertion returned no row" rows
    when (isJust subject.profileDid) $ runInsert ctx.db (insertForeign T.profileShouts [toForeign { shoutId: row.id, userId: toNullable subject.ownerId }])
    when (isJust subject.scrobbleId || isJust subject.profileDid) $ void $ createNotification ctx
      { userId: toNullable subject.ownerId, actorId: notNull user.id, type: if isJust subject.scrobbleId then "comment_scrobble" else "comment_profile"
      , shoutId: notNull row.id, subjectUri: toNullable (subject.uri <|> (map ("at://" <> _) subject.profileDid)) }
    let mentionSubjectUri = fromMaybe row.uri (nonempty subject.uri <|> (map ("at://" <> _) subject.profileDid))
    notifyMentions ctx shout.facets user.id row.id mentionSubjectUri (fromMaybe [] (map pure subject.ownerId))

requireRow :: forall a. String -> Array a -> Aff a
requireRow message rows = case head rows of
  Just row -> pure row
  Nothing -> throwError (error message)

type ReplyRow =
  { shout :: SelectShout, trackId :: Nullable String, trackUri :: Nullable String
  , albumId :: Nullable String, albumUri :: Nullable String, artistId :: Nullable String, artistUri :: Nullable String
  , scrobbleId :: Nullable String, scrobbleUri :: Nullable String }

replyShout :: Context -> Shout -> String -> SelectUser -> Api.Agent -> Aff Unit
replyShout ctx reply shoutUri user agent = do
  rows :: Array ReplyRow <- run ctx.db
    (selectFieldsFrom { shout: tableSQL T.shouts, trackId: toSQL T.tracksC.id, trackUri: toSQL T.tracksC.uri, albumId: toSQL T.albumsC.id, albumUri: toSQL T.albumsC.uri, artistId: toSQL T.artistsC.id, artistUri: toSQL T.artistsC.uri, scrobbleId: toSQL T.scrobblesC.id, scrobbleUri: toSQL T.scrobblesC.uri } T.shouts
      # leftJoin T.tracks (SQL.eq (toSQL T.shoutsC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.albums (SQL.eq (toSQL T.shoutsC.albumId) (toSQL T.albumsC.id))
      # leftJoin T.artists (SQL.eq (toSQL T.shoutsC.artistId) (toSQL T.artistsC.id))
      # leftJoin T.scrobbles (SQL.eq (toSQL T.shoutsC.scrobbleId) (toSQL T.scrobblesC.id))
      # where_ (SQL.eq (toSQL T.shoutsC.uri) (SQL.string shoutUri)) # limit 1)
  row <- requireRow "Shout not found" rows
  repo <- liftEffect (Api.assertDid agent)
  profileRecord <- Api.getRecord agent { repo, collection: "app.bsky.actor.profile", rkey: "self" }
  let collection = if isJust (toMaybe row.scrobbleId) then "app.rocksky.scrobble" else if isJust (toMaybe row.artistId) then "app.rocksky.artist" else if isJust (toMaybe row.albumId) then "app.rocksky.album" else if isJust (toMaybe row.trackId) then "app.rocksky.song" else "app.bsky.actor.profile"
  let subjectUri = fromMaybe profileRecord.uri (nonempty (toMaybe row.trackUri) <|> nonempty (toMaybe row.albumUri) <|> nonempty (toMaybe row.artistUri) <|> nonempty (toMaybe row.scrobbleUri))
  subject <- remoteRef ctx subjectUri collection "[reply] invalid ref"
  parent <- remoteRef ctx row.shout.uri shoutCollection "[reply] invalid ref"
  rkey <- liftEffect tidNextStr
  createdAt <- nowIso
  let record = mergeForeign (shoutFields reply) (toForeign { "$type": shoutCollection, subject, parent, createdAt })
  validate ctx shoutCollection record "Invalid record"
  recoverWith unit do
    created <- Api.createRecord agent { repo, collection: shoutCollection, rkey: notNull rkey, record, validate: false }
    inserted :: Array SelectShout <- runInsertReturning ctx.db (insertForeign T.shouts
      [mergeForeign (storageFields reply) (omitNulls (toForeign { uri: created.uri, parentId: row.shout.id, authorId: user.id, trackId: row.trackId, albumId: row.albumId, artistId: row.artistId, scrobbleId: row.scrobbleId }))])
    shout <- requireRow "Reply insertion returned no row" inserted
    when (collection == "app.bsky.actor.profile") do
      profiles :: Array { userId :: String } <- run ctx.db (selectFieldsFrom { userId: toSQL T.profileShoutsC.userId } T.profileShouts # where_ (SQL.eq (toSQL T.profileShoutsC.shoutId) (SQL.string row.shout.id)) # limit 1)
      profile <- requireRow "Profile shout not found" profiles
      runInsert ctx.db (insertForeign T.profileShouts [toForeign { shoutId: shout.id, userId: profile.userId }])
    void $ createNotification ctx { userId: notNull row.shout.authorId, actorId: notNull user.id, type: "reply", shoutId: notNull shout.id, subjectUri: notNull subjectUri }
    notifyMentions ctx reply.facets user.id shout.id subjectUri [row.shout.authorId]

findLike :: Context -> String -> String -> Aff (Array { id :: String, uri :: String })
findLike ctx shoutUri userId = run ctx.db
  (selectFieldsFrom { id: toSQL T.shoutLikesC.id, uri: toSQL T.shoutLikesC.uri } T.shoutLikes
    # innerJoin T.shouts (SQL.eq (toSQL T.shoutLikesC.shoutId) (toSQL T.shoutsC.id))
    # where_ (SQL.and (SQL.eq (toSQL T.shoutsC.uri) (SQL.string shoutUri)) (SQL.eq (toSQL T.shoutLikesC.userId) (SQL.string userId))) # limit 1)

likeShout :: Context -> String -> SelectUser -> Api.Agent -> Aff Unit
likeShout ctx shoutUri user agent = do
  rkey <- liftEffect tidNextStr
  likes <- findLike ctx shoutUri user.id
  when (null likes) do
    subject <- remoteRef ctx shoutUri shoutCollection "[like] invalid ref"
    createdAt <- nowIso
    let record = toForeign { "$type": "app.rocksky.like", subject, createdAt }
    validate ctx "app.rocksky.like" record "Invalid record"
    recoverWith unit do
      repo <- liftEffect (Api.assertDid agent)
      created <- Api.createRecord agent { repo, collection: "app.rocksky.like", rkey: notNull rkey, record, validate: false }
      rows :: Array SelectShout <- run ctx.db (selectFrom T.shouts # where_ (SQL.eq (toSQL T.shoutsC.uri) (SQL.string shoutUri)) # limit 1)
      shout <- requireRow "Shout not found" rows
      runInsert ctx.db (insertForeign T.shoutLikes [toForeign { shoutId: shout.id, userId: user.id, uri: created.uri }])
      void $ createNotification ctx { userId: notNull shout.authorId, actorId: notNull user.id, type: "react_comment", shoutId: notNull shout.id, subjectUri: notNull shout.uri }

unlikeShout :: Context -> String -> SelectUser -> Api.Agent -> Aff Unit
unlikeShout ctx shoutUri user agent = do
  likes <- findLike ctx shoutUri user.id
  case head likes of
    Nothing -> pure unit
    Just like -> do
      repo <- liftEffect (Api.assertDid agent)
      parSequence_
        [Api.deleteRecord agent { repo, collection: "app.rocksky.like", rkey: rkeyOf like.uri }
        ,runDelete ctx.db (deleteFrom T.shoutLikes # where_ (SQL.eq (toSQL T.shoutLikesC.id) (SQL.string like.id)))]
