module Rocksky.Xrpc.App.Rocksky.Like.Song (mutate) where

import Prelude
import Atproto.XrpcServer (HandlerInput)
import Data.Int (toNumber)
import Data.Nullable (toMaybe, toNullable)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (readStringAt, undefined, unsafeFromForeign)
import Rocksky.Lovedtracks.Service (likeTrack, unLikeTrack)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Shouts.Service (requireRow)
import Rocksky.Xrpc.App.Rocksky.Shout.Mutations (required)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid, requireAgent, requireDid)
import Rocksky.Xrpc.Util (authDid, inputBody)

mutate :: Boolean -> Context -> HandlerInput -> Aff Unit
mutate enabled ctx input = do
  did <- requireDid (authDid input)
  uri <- required "Missing song uri" (inputBody input >>= readStringAt "uri")
  user <- findUserByDid ctx did
  agent <- requireAgent ctx did
  rows :: Array SelectTrack <- run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string uri)) # limit 1)
  track <- requireRow "Track not found" rows
  if enabled then void $ likeTrack ctx
    { title: track.title, artist: track.artist, album: track.album, albumArt: track.albumArt
    , albumArtist: track.albumArtist, trackNumber: toNullable (toNumber <$> toMaybe track.trackNumber)
    , duration: toNumber track.duration, composer: track.composer, lyrics: track.lyrics
    , discNumber: toNullable (toNumber <$> toMaybe track.discNumber)
    , mbId: unsafeFromForeign undefined, releaseDate: unsafeFromForeign undefined, year: unsafeFromForeign undefined
    } user agent
  else unLikeTrack ctx track.sha256 user agent
