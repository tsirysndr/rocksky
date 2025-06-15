/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  createServer as createXrpcServer,
  Server as XrpcServer,
  Options as XrpcOptions,
  AuthVerifier,
  StreamAuthVerifier,
} from '@atproto/xrpc-server'
import { schemas } from './lexicons'
import * as AppRockskyActorGetActorAlbums from './types/app/rocksky/actor/getActorAlbums'
import * as AppRockskyActorGetActorArtists from './types/app/rocksky/actor/getActorArtists'
import * as AppRockskyActorGetActorLovedSongs from './types/app/rocksky/actor/getActorLovedSongs'
import * as AppRockskyActorGetActorPlaylists from './types/app/rocksky/actor/getActorPlaylists'
import * as AppRockskyActorGetActorScrobbles from './types/app/rocksky/actor/getActorScrobbles'
import * as AppRockskyActorGetActorSongs from './types/app/rocksky/actor/getActorSongs'
import * as AppRockskyActorGetProfile from './types/app/rocksky/actor/getProfile'
import * as AppRockskyAlbumGetAlbum from './types/app/rocksky/album/getAlbum'
import * as AppRockskyAlbumGetAlbums from './types/app/rocksky/album/getAlbums'
import * as AppRockskyAlbumGetAlbumTracks from './types/app/rocksky/album/getAlbumTracks'
import * as AppRockskyApikeyCreateApikey from './types/app/rocksky/apikey/createApikey'
import * as AppRockskyApikeyGetApikeys from './types/app/rocksky/apikey/getApikeys'
import * as AppRockskyApikeyRemoveApikey from './types/app/rocksky/apikey/removeApikey'
import * as AppRockskyApikeyUpdateApikey from './types/app/rocksky/apikey/updateApikey'
import * as AppRockskyArtistGetArtistAlbums from './types/app/rocksky/artist/getArtistAlbums'
import * as AppRockskyArtistGetArtist from './types/app/rocksky/artist/getArtist'
import * as AppRockskyArtistGetArtists from './types/app/rocksky/artist/getArtists'
import * as AppRockskyArtistGetArtistTracks from './types/app/rocksky/artist/getArtistTracks'
import * as AppRockskyChartsGetScrobblesChart from './types/app/rocksky/charts/getScrobblesChart'
import * as AppRockskyDropboxDownloadFile from './types/app/rocksky/dropbox/downloadFile'
import * as AppRockskyDropboxGetFiles from './types/app/rocksky/dropbox/getFiles'
import * as AppRockskyDropboxGetMetadata from './types/app/rocksky/dropbox/getMetadata'
import * as AppRockskyDropboxGetTemporaryLink from './types/app/rocksky/dropbox/getTemporaryLink'
import * as AppRockskyFeedGetNowPlayings from './types/app/rocksky/feed/getNowPlayings'
import * as AppRockskyFeedSearch from './types/app/rocksky/feed/search'
import * as AppRockskyGoogledriveDownloadFile from './types/app/rocksky/googledrive/downloadFile'
import * as AppRockskyGoogledriveGetFile from './types/app/rocksky/googledrive/getFile'
import * as AppRockskyGoogledriveGetFiles from './types/app/rocksky/googledrive/getFiles'
import * as AppRockskyLikeDislikeShout from './types/app/rocksky/like/dislikeShout'
import * as AppRockskyLikeDislikeSong from './types/app/rocksky/like/dislikeSong'
import * as AppRockskyLikeLikeShout from './types/app/rocksky/like/likeShout'
import * as AppRockskyLikeLikeSong from './types/app/rocksky/like/likeSong'
import * as AppRockskyPlayerGetCurrentlyPlaying from './types/app/rocksky/player/getCurrentlyPlaying'
import * as AppRockskyPlayerNext from './types/app/rocksky/player/next'
import * as AppRockskyPlayerPause from './types/app/rocksky/player/pause'
import * as AppRockskyPlayerPlay from './types/app/rocksky/player/play'
import * as AppRockskyPlayerPrevious from './types/app/rocksky/player/previous'
import * as AppRockskyPlayerSeek from './types/app/rocksky/player/seek'
import * as AppRockskyPlaylistGetPlaylist from './types/app/rocksky/playlist/getPlaylist'
import * as AppRockskyPlaylistGetPlaylists from './types/app/rocksky/playlist/getPlaylists'
import * as AppRockskyScrobbleCreateScrobble from './types/app/rocksky/scrobble/createScrobble'
import * as AppRockskyScrobbleGetScrobble from './types/app/rocksky/scrobble/getScrobble'
import * as AppRockskyScrobbleGetScrobbles from './types/app/rocksky/scrobble/getScrobbles'
import * as AppRockskyShoutCreateShout from './types/app/rocksky/shout/createShout'
import * as AppRockskyShoutGetAlbumShouts from './types/app/rocksky/shout/getAlbumShouts'
import * as AppRockskyShoutGetArtistShouts from './types/app/rocksky/shout/getArtistShouts'
import * as AppRockskyShoutGetProfileShouts from './types/app/rocksky/shout/getProfileShouts'
import * as AppRockskyShoutGetShoutReplies from './types/app/rocksky/shout/getShoutReplies'
import * as AppRockskyShoutGetTrackShouts from './types/app/rocksky/shout/getTrackShouts'
import * as AppRockskyShoutRemoveShout from './types/app/rocksky/shout/removeShout'
import * as AppRockskyShoutReplyShout from './types/app/rocksky/shout/replyShout'
import * as AppRockskyShoutReportShout from './types/app/rocksky/shout/reportShout'
import * as AppRockskySongCreateSong from './types/app/rocksky/song/createSong'
import * as AppRockskySongGetSong from './types/app/rocksky/song/getSong'
import * as AppRockskySongGetSongs from './types/app/rocksky/song/getSongs'
import * as AppRockskySpotifyGetCurrentlyPlaying from './types/app/rocksky/spotify/getCurrentlyPlaying'
import * as AppRockskySpotifyNext from './types/app/rocksky/spotify/next'
import * as AppRockskySpotifyPause from './types/app/rocksky/spotify/pause'
import * as AppRockskySpotifyPlay from './types/app/rocksky/spotify/play'
import * as AppRockskySpotifyPrevious from './types/app/rocksky/spotify/previous'
import * as AppRockskySpotifySeek from './types/app/rocksky/spotify/seek'
import * as AppRockskyStatsGetStats from './types/app/rocksky/stats/getStats'

export function createServer(options?: XrpcOptions): Server {
  return new Server(options)
}

export class Server {
  xrpc: XrpcServer
  app: AppNS
  com: ComNS

  constructor(options?: XrpcOptions) {
    this.xrpc = createXrpcServer(schemas, options)
    this.app = new AppNS(this)
    this.com = new ComNS(this)
  }
}

export class AppNS {
  _server: Server
  rocksky: AppRockskyNS
  bsky: AppBskyNS

  constructor(server: Server) {
    this._server = server
    this.rocksky = new AppRockskyNS(server)
    this.bsky = new AppBskyNS(server)
  }
}

export class AppRockskyNS {
  _server: Server
  actor: AppRockskyActorNS
  album: AppRockskyAlbumNS
  apikey: AppRockskyApikeyNS
  artist: AppRockskyArtistNS
  charts: AppRockskyChartsNS
  dropbox: AppRockskyDropboxNS
  feed: AppRockskyFeedNS
  googledrive: AppRockskyGoogledriveNS
  like: AppRockskyLikeNS
  player: AppRockskyPlayerNS
  playlist: AppRockskyPlaylistNS
  scrobble: AppRockskyScrobbleNS
  shout: AppRockskyShoutNS
  song: AppRockskySongNS
  spotify: AppRockskySpotifyNS
  stats: AppRockskyStatsNS

  constructor(server: Server) {
    this._server = server
    this.actor = new AppRockskyActorNS(server)
    this.album = new AppRockskyAlbumNS(server)
    this.apikey = new AppRockskyApikeyNS(server)
    this.artist = new AppRockskyArtistNS(server)
    this.charts = new AppRockskyChartsNS(server)
    this.dropbox = new AppRockskyDropboxNS(server)
    this.feed = new AppRockskyFeedNS(server)
    this.googledrive = new AppRockskyGoogledriveNS(server)
    this.like = new AppRockskyLikeNS(server)
    this.player = new AppRockskyPlayerNS(server)
    this.playlist = new AppRockskyPlaylistNS(server)
    this.scrobble = new AppRockskyScrobbleNS(server)
    this.shout = new AppRockskyShoutNS(server)
    this.song = new AppRockskySongNS(server)
    this.spotify = new AppRockskySpotifyNS(server)
    this.stats = new AppRockskyStatsNS(server)
  }
}

export class AppRockskyActorNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getActorAlbums<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorAlbums.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorAlbums.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorAlbums' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getActorArtists<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorArtists.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorArtists.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorArtists' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getActorLovedSongs<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorLovedSongs.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorLovedSongs.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorLovedSongs' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getActorPlaylists<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorPlaylists.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorPlaylists.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorPlaylists' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getActorScrobbles<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorScrobbles.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorScrobbles.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorScrobbles' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getActorSongs<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetActorSongs.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetActorSongs.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getActorSongs' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getProfile<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyActorGetProfile.Handler<ExtractAuth<AV>>,
      AppRockskyActorGetProfile.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.actor.getProfile' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyAlbumNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getAlbum<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyAlbumGetAlbum.Handler<ExtractAuth<AV>>,
      AppRockskyAlbumGetAlbum.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.album.getAlbum' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getAlbums<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyAlbumGetAlbums.Handler<ExtractAuth<AV>>,
      AppRockskyAlbumGetAlbums.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.album.getAlbums' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getAlbumTracks<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyAlbumGetAlbumTracks.Handler<ExtractAuth<AV>>,
      AppRockskyAlbumGetAlbumTracks.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.album.getAlbumTracks' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyApikeyNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  createApikey<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyApikeyCreateApikey.Handler<ExtractAuth<AV>>,
      AppRockskyApikeyCreateApikey.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.apikey.createApikey' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getApikeys<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyApikeyGetApikeys.Handler<ExtractAuth<AV>>,
      AppRockskyApikeyGetApikeys.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.apikey.getApikeys' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  removeApikey<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyApikeyRemoveApikey.Handler<ExtractAuth<AV>>,
      AppRockskyApikeyRemoveApikey.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.apikey.removeApikey' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  updateApikey<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyApikeyUpdateApikey.Handler<ExtractAuth<AV>>,
      AppRockskyApikeyUpdateApikey.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.apikey.updateApikey' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyArtistNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getArtistAlbums<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyArtistGetArtistAlbums.Handler<ExtractAuth<AV>>,
      AppRockskyArtistGetArtistAlbums.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.artist.getArtistAlbums' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getArtist<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyArtistGetArtist.Handler<ExtractAuth<AV>>,
      AppRockskyArtistGetArtist.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.artist.getArtist' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getArtists<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyArtistGetArtists.Handler<ExtractAuth<AV>>,
      AppRockskyArtistGetArtists.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.artist.getArtists' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getArtistTracks<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyArtistGetArtistTracks.Handler<ExtractAuth<AV>>,
      AppRockskyArtistGetArtistTracks.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.artist.getArtistTracks' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyChartsNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getScrobblesChart<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyChartsGetScrobblesChart.Handler<ExtractAuth<AV>>,
      AppRockskyChartsGetScrobblesChart.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.charts.getScrobblesChart' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyDropboxNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  downloadFile<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyDropboxDownloadFile.Handler<ExtractAuth<AV>>,
      AppRockskyDropboxDownloadFile.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.dropbox.downloadFile' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getFiles<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyDropboxGetFiles.Handler<ExtractAuth<AV>>,
      AppRockskyDropboxGetFiles.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.dropbox.getFiles' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getMetadata<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyDropboxGetMetadata.Handler<ExtractAuth<AV>>,
      AppRockskyDropboxGetMetadata.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.dropbox.getMetadata' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getTemporaryLink<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyDropboxGetTemporaryLink.Handler<ExtractAuth<AV>>,
      AppRockskyDropboxGetTemporaryLink.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.dropbox.getTemporaryLink' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyFeedNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getNowPlayings<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyFeedGetNowPlayings.Handler<ExtractAuth<AV>>,
      AppRockskyFeedGetNowPlayings.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.feed.getNowPlayings' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  search<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyFeedSearch.Handler<ExtractAuth<AV>>,
      AppRockskyFeedSearch.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.feed.search' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyGoogledriveNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  downloadFile<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyGoogledriveDownloadFile.Handler<ExtractAuth<AV>>,
      AppRockskyGoogledriveDownloadFile.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.googledrive.downloadFile' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getFile<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyGoogledriveGetFile.Handler<ExtractAuth<AV>>,
      AppRockskyGoogledriveGetFile.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.googledrive.getFile' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getFiles<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyGoogledriveGetFiles.Handler<ExtractAuth<AV>>,
      AppRockskyGoogledriveGetFiles.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.googledrive.getFiles' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyLikeNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  dislikeShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyLikeDislikeShout.Handler<ExtractAuth<AV>>,
      AppRockskyLikeDislikeShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.like.dislikeShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  dislikeSong<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyLikeDislikeSong.Handler<ExtractAuth<AV>>,
      AppRockskyLikeDislikeSong.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.like.dislikeSong' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  likeShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyLikeLikeShout.Handler<ExtractAuth<AV>>,
      AppRockskyLikeLikeShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.like.likeShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  likeSong<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyLikeLikeSong.Handler<ExtractAuth<AV>>,
      AppRockskyLikeLikeSong.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.like.likeSong' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyPlayerNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getCurrentlyPlaying<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerGetCurrentlyPlaying.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerGetCurrentlyPlaying.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.getCurrentlyPlaying' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  next<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerNext.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerNext.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.next' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  pause<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerPause.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerPause.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.pause' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  play<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerPlay.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerPlay.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.play' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  previous<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerPrevious.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerPrevious.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.previous' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  seek<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlayerSeek.Handler<ExtractAuth<AV>>,
      AppRockskyPlayerSeek.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.player.seek' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyPlaylistNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getPlaylist<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlaylistGetPlaylist.Handler<ExtractAuth<AV>>,
      AppRockskyPlaylistGetPlaylist.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.playlist.getPlaylist' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getPlaylists<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyPlaylistGetPlaylists.Handler<ExtractAuth<AV>>,
      AppRockskyPlaylistGetPlaylists.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.playlist.getPlaylists' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyScrobbleNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  createScrobble<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyScrobbleCreateScrobble.Handler<ExtractAuth<AV>>,
      AppRockskyScrobbleCreateScrobble.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.scrobble.createScrobble' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getScrobble<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyScrobbleGetScrobble.Handler<ExtractAuth<AV>>,
      AppRockskyScrobbleGetScrobble.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.scrobble.getScrobble' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getScrobbles<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyScrobbleGetScrobbles.Handler<ExtractAuth<AV>>,
      AppRockskyScrobbleGetScrobbles.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.scrobble.getScrobbles' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyShoutNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  createShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutCreateShout.Handler<ExtractAuth<AV>>,
      AppRockskyShoutCreateShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.createShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getAlbumShouts<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutGetAlbumShouts.Handler<ExtractAuth<AV>>,
      AppRockskyShoutGetAlbumShouts.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.getAlbumShouts' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getArtistShouts<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutGetArtistShouts.Handler<ExtractAuth<AV>>,
      AppRockskyShoutGetArtistShouts.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.getArtistShouts' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getProfileShouts<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutGetProfileShouts.Handler<ExtractAuth<AV>>,
      AppRockskyShoutGetProfileShouts.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.getProfileShouts' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getShoutReplies<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutGetShoutReplies.Handler<ExtractAuth<AV>>,
      AppRockskyShoutGetShoutReplies.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.getShoutReplies' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getTrackShouts<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutGetTrackShouts.Handler<ExtractAuth<AV>>,
      AppRockskyShoutGetTrackShouts.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.getTrackShouts' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  removeShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutRemoveShout.Handler<ExtractAuth<AV>>,
      AppRockskyShoutRemoveShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.removeShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  replyShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutReplyShout.Handler<ExtractAuth<AV>>,
      AppRockskyShoutReplyShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.replyShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  reportShout<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyShoutReportShout.Handler<ExtractAuth<AV>>,
      AppRockskyShoutReportShout.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.shout.reportShout' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskySongNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  createSong<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySongCreateSong.Handler<ExtractAuth<AV>>,
      AppRockskySongCreateSong.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.song.createSong' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getSong<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySongGetSong.Handler<ExtractAuth<AV>>,
      AppRockskySongGetSong.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.song.getSong' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  getSongs<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySongGetSongs.Handler<ExtractAuth<AV>>,
      AppRockskySongGetSongs.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.song.getSongs' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskySpotifyNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getCurrentlyPlaying<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifyGetCurrentlyPlaying.Handler<ExtractAuth<AV>>,
      AppRockskySpotifyGetCurrentlyPlaying.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.getCurrentlyPlaying' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  next<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifyNext.Handler<ExtractAuth<AV>>,
      AppRockskySpotifyNext.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.next' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  pause<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifyPause.Handler<ExtractAuth<AV>>,
      AppRockskySpotifyPause.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.pause' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  play<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifyPlay.Handler<ExtractAuth<AV>>,
      AppRockskySpotifyPlay.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.play' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  previous<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifyPrevious.Handler<ExtractAuth<AV>>,
      AppRockskySpotifyPrevious.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.previous' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }

  seek<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskySpotifySeek.Handler<ExtractAuth<AV>>,
      AppRockskySpotifySeek.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.spotify.seek' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppRockskyStatsNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }

  getStats<AV extends AuthVerifier>(
    cfg: ConfigOf<
      AV,
      AppRockskyStatsGetStats.Handler<ExtractAuth<AV>>,
      AppRockskyStatsGetStats.HandlerReqCtx<ExtractAuth<AV>>
    >,
  ) {
    const nsid = 'app.rocksky.stats.getStats' // @ts-ignore
    return this._server.xrpc.method(nsid, cfg)
  }
}

export class AppBskyNS {
  _server: Server
  actor: AppBskyActorNS

  constructor(server: Server) {
    this._server = server
    this.actor = new AppBskyActorNS(server)
  }
}

export class AppBskyActorNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }
}

export class ComNS {
  _server: Server
  atproto: ComAtprotoNS

  constructor(server: Server) {
    this._server = server
    this.atproto = new ComAtprotoNS(server)
  }
}

export class ComAtprotoNS {
  _server: Server
  repo: ComAtprotoRepoNS

  constructor(server: Server) {
    this._server = server
    this.repo = new ComAtprotoRepoNS(server)
  }
}

export class ComAtprotoRepoNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }
}

type SharedRateLimitOpts<T> = {
  name: string
  calcKey?: (ctx: T) => string | null
  calcPoints?: (ctx: T) => number
}
type RouteRateLimitOpts<T> = {
  durationMs: number
  points: number
  calcKey?: (ctx: T) => string | null
  calcPoints?: (ctx: T) => number
}
type HandlerOpts = { blobLimit?: number }
type HandlerRateLimitOpts<T> = SharedRateLimitOpts<T> | RouteRateLimitOpts<T>
type ConfigOf<Auth, Handler, ReqCtx> =
  | Handler
  | {
      auth?: Auth
      opts?: HandlerOpts
      rateLimit?: HandlerRateLimitOpts<ReqCtx> | HandlerRateLimitOpts<ReqCtx>[]
      handler: Handler
    }
type ExtractAuth<AV extends AuthVerifier | StreamAuthVerifier> = Extract<
  Awaited<ReturnType<AV>>,
  { credentials: unknown }
>
