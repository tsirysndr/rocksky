/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type Auth,
  createServer as createXrpcServer,
  type MethodConfigOrHandler,
  type Options as XrpcOptions,
  type Server as XrpcServer,
} from "@atp/xrpc-server";
import { schemas } from "./lexicons.ts";
import type * as AppRockskyShoutGetAlbumShouts from "./types/app/rocksky/shout/getAlbumShouts.ts";
import type * as AppRockskyShoutReportShout from "./types/app/rocksky/shout/reportShout.ts";
import type * as AppRockskyShoutGetTrackShouts from "./types/app/rocksky/shout/getTrackShouts.ts";
import type * as AppRockskyShoutReplyShout from "./types/app/rocksky/shout/replyShout.ts";
import type * as AppRockskyShoutRemoveShout from "./types/app/rocksky/shout/removeShout.ts";
import type * as AppRockskyShoutGetProfileShouts from "./types/app/rocksky/shout/getProfileShouts.ts";
import type * as AppRockskyShoutGetArtistShouts from "./types/app/rocksky/shout/getArtistShouts.ts";
import type * as AppRockskyShoutGetShoutReplies from "./types/app/rocksky/shout/getShoutReplies.ts";
import type * as AppRockskyShoutCreateShout from "./types/app/rocksky/shout/createShout.ts";
import type * as AppRockskyScrobbleCreateScrobble from "./types/app/rocksky/scrobble/createScrobble.ts";
import type * as AppRockskyScrobbleGetScrobbles from "./types/app/rocksky/scrobble/getScrobbles.ts";
import type * as AppRockskyScrobbleGetScrobble from "./types/app/rocksky/scrobble/getScrobble.ts";
import type * as AppRockskyLikeDislikeShout from "./types/app/rocksky/like/dislikeShout.ts";
import type * as AppRockskyLikeLikeSong from "./types/app/rocksky/like/likeSong.ts";
import type * as AppRockskyLikeDislikeSong from "./types/app/rocksky/like/dislikeSong.ts";
import type * as AppRockskyLikeLikeShout from "./types/app/rocksky/like/likeShout.ts";
import type * as AppRockskyPlaylistCreatePlaylist from "./types/app/rocksky/playlist/createPlaylist.ts";
import type * as AppRockskyPlaylistStartPlaylist from "./types/app/rocksky/playlist/startPlaylist.ts";
import type * as AppRockskyPlaylistGetPlaylists from "./types/app/rocksky/playlist/getPlaylists.ts";
import type * as AppRockskyPlaylistInsertDirectory from "./types/app/rocksky/playlist/insertDirectory.ts";
import type * as AppRockskyPlaylistRemoveTrack from "./types/app/rocksky/playlist/removeTrack.ts";
import type * as AppRockskyPlaylistRemovePlaylist from "./types/app/rocksky/playlist/removePlaylist.ts";
import type * as AppRockskyPlaylistInsertFiles from "./types/app/rocksky/playlist/insertFiles.ts";
import type * as AppRockskyPlaylistGetPlaylist from "./types/app/rocksky/playlist/getPlaylist.ts";
import type * as AppRockskySpotifySeek from "./types/app/rocksky/spotify/seek.ts";
import type * as AppRockskySpotifyNext from "./types/app/rocksky/spotify/next.ts";
import type * as AppRockskySpotifyGetCurrentlyPlaying from "./types/app/rocksky/spotify/getCurrentlyPlaying.ts";
import type * as AppRockskySpotifyPrevious from "./types/app/rocksky/spotify/previous.ts";
import type * as AppRockskySpotifyPause from "./types/app/rocksky/spotify/pause.ts";
import type * as AppRockskySpotifyPlay from "./types/app/rocksky/spotify/play.ts";
import type * as AppRockskyChartsGetScrobblesChart from "./types/app/rocksky/charts/getScrobblesChart.ts";
import type * as AppRockskySongGetSongs from "./types/app/rocksky/song/getSongs.ts";
import type * as AppRockskySongGetSong from "./types/app/rocksky/song/getSong.ts";
import type * as AppRockskySongCreateSong from "./types/app/rocksky/song/createSong.ts";
import type * as AppRockskyApikeyGetApikeys from "./types/app/rocksky/apikey/getApikeys.ts";
import type * as AppRockskyApikeyUpdateApikey from "./types/app/rocksky/apikey/updateApikey.ts";
import type * as AppRockskyApikeyCreateApikey from "./types/app/rocksky/apikey/createApikey.ts";
import type * as AppRockskyApikeyRemoveApikey from "./types/app/rocksky/apikey/removeApikey.ts";
import type * as AppRockskyFeedGetFeedGenerators from "./types/app/rocksky/feed/getFeedGenerators.ts";
import type * as AppRockskyFeedGetFeedGenerator from "./types/app/rocksky/feed/getFeedGenerator.ts";
import type * as AppRockskyFeedSearch from "./types/app/rocksky/feed/search.ts";
import type * as AppRockskyFeedGetNowPlayings from "./types/app/rocksky/feed/getNowPlayings.ts";
import type * as AppRockskyFeedDescribeFeedGenerator from "./types/app/rocksky/feed/describeFeedGenerator.ts";
import type * as AppRockskyFeedGetFeed from "./types/app/rocksky/feed/getFeed.ts";
import type * as AppRockskyFeedGetFeedSkeleton from "./types/app/rocksky/feed/getFeedSkeleton.ts";
import type * as AppRockskyDropboxDownloadFile from "./types/app/rocksky/dropbox/downloadFile.ts";
import type * as AppRockskyDropboxGetFiles from "./types/app/rocksky/dropbox/getFiles.ts";
import type * as AppRockskyDropboxGetMetadata from "./types/app/rocksky/dropbox/getMetadata.ts";
import type * as AppRockskyDropboxGetTemporaryLink from "./types/app/rocksky/dropbox/getTemporaryLink.ts";
import type * as AppRockskyGoogledriveGetFile from "./types/app/rocksky/googledrive/getFile.ts";
import type * as AppRockskyGoogledriveDownloadFile from "./types/app/rocksky/googledrive/downloadFile.ts";
import type * as AppRockskyGoogledriveGetFiles from "./types/app/rocksky/googledrive/getFiles.ts";
import type * as AppRockskyAlbumGetAlbumTracks from "./types/app/rocksky/album/getAlbumTracks.ts";
import type * as AppRockskyAlbumGetAlbum from "./types/app/rocksky/album/getAlbum.ts";
import type * as AppRockskyAlbumGetAlbums from "./types/app/rocksky/album/getAlbums.ts";
import type * as AppRockskyActorGetActorPlaylists from "./types/app/rocksky/actor/getActorPlaylists.ts";
import type * as AppRockskyActorGetActorSongs from "./types/app/rocksky/actor/getActorSongs.ts";
import type * as AppRockskyActorGetActorArtists from "./types/app/rocksky/actor/getActorArtists.ts";
import type * as AppRockskyActorGetProfile from "./types/app/rocksky/actor/getProfile.ts";
import type * as AppRockskyActorGetActorLovedSongs from "./types/app/rocksky/actor/getActorLovedSongs.ts";
import type * as AppRockskyActorGetActorAlbums from "./types/app/rocksky/actor/getActorAlbums.ts";
import type * as AppRockskyActorGetActorScrobbles from "./types/app/rocksky/actor/getActorScrobbles.ts";
import type * as AppRockskyArtistGetArtistAlbums from "./types/app/rocksky/artist/getArtistAlbums.ts";
import type * as AppRockskyArtistGetArtistListeners from "./types/app/rocksky/artist/getArtistListeners.ts";
import type * as AppRockskyArtistGetArtists from "./types/app/rocksky/artist/getArtists.ts";
import type * as AppRockskyArtistGetArtist from "./types/app/rocksky/artist/getArtist.ts";
import type * as AppRockskyArtistGetArtistTracks from "./types/app/rocksky/artist/getArtistTracks.ts";
import type * as AppRockskyStatsGetStats from "./types/app/rocksky/stats/getStats.ts";
import type * as AppRockskyPlayerSeek from "./types/app/rocksky/player/seek.ts";
import type * as AppRockskyPlayerGetPlaybackQueue from "./types/app/rocksky/player/getPlaybackQueue.ts";
import type * as AppRockskyPlayerNext from "./types/app/rocksky/player/next.ts";
import type * as AppRockskyPlayerPlayFile from "./types/app/rocksky/player/playFile.ts";
import type * as AppRockskyPlayerGetCurrentlyPlaying from "./types/app/rocksky/player/getCurrentlyPlaying.ts";
import type * as AppRockskyPlayerPrevious from "./types/app/rocksky/player/previous.ts";
import type * as AppRockskyPlayerAddItemsToQueue from "./types/app/rocksky/player/addItemsToQueue.ts";
import type * as AppRockskyPlayerPause from "./types/app/rocksky/player/pause.ts";
import type * as AppRockskyPlayerPlay from "./types/app/rocksky/player/play.ts";
import type * as AppRockskyPlayerPlayDirectory from "./types/app/rocksky/player/playDirectory.ts";
import type * as AppRockskyPlayerAddDirectoryToQueue from "./types/app/rocksky/player/addDirectoryToQueue.ts";

export function createServer(options?: XrpcOptions): Server {
  return new Server(options);
}

export class Server {
  xrpc: XrpcServer;
  com: ComNS;
  app: AppNS;

  constructor(options?: XrpcOptions) {
    this.xrpc = createXrpcServer(schemas, options);
    this.com = new ComNS(this);
    this.app = new AppNS(this);
  }
}

export class ComNS {
  _server: Server;
  atproto: ComAtprotoNS;

  constructor(server: Server) {
    this._server = server;
    this.atproto = new ComAtprotoNS(server);
  }
}

export class ComAtprotoNS {
  _server: Server;
  repo: ComAtprotoRepoNS;

  constructor(server: Server) {
    this._server = server;
    this.repo = new ComAtprotoRepoNS(server);
  }
}

export class ComAtprotoRepoNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}

export class AppNS {
  _server: Server;
  rocksky: AppRockskyNS;
  bsky: AppBskyNS;

  constructor(server: Server) {
    this._server = server;
    this.rocksky = new AppRockskyNS(server);
    this.bsky = new AppBskyNS(server);
  }
}

export class AppRockskyNS {
  _server: Server;
  shout: AppRockskyShoutNS;
  scrobble: AppRockskyScrobbleNS;
  like: AppRockskyLikeNS;
  playlist: AppRockskyPlaylistNS;
  spotify: AppRockskySpotifyNS;
  charts: AppRockskyChartsNS;
  song: AppRockskySongNS;
  apikey: AppRockskyApikeyNS;
  feed: AppRockskyFeedNS;
  dropbox: AppRockskyDropboxNS;
  googledrive: AppRockskyGoogledriveNS;
  album: AppRockskyAlbumNS;
  actor: AppRockskyActorNS;
  artist: AppRockskyArtistNS;
  stats: AppRockskyStatsNS;
  player: AppRockskyPlayerNS;

  constructor(server: Server) {
    this._server = server;
    this.shout = new AppRockskyShoutNS(server);
    this.scrobble = new AppRockskyScrobbleNS(server);
    this.like = new AppRockskyLikeNS(server);
    this.playlist = new AppRockskyPlaylistNS(server);
    this.spotify = new AppRockskySpotifyNS(server);
    this.charts = new AppRockskyChartsNS(server);
    this.song = new AppRockskySongNS(server);
    this.apikey = new AppRockskyApikeyNS(server);
    this.feed = new AppRockskyFeedNS(server);
    this.dropbox = new AppRockskyDropboxNS(server);
    this.googledrive = new AppRockskyGoogledriveNS(server);
    this.album = new AppRockskyAlbumNS(server);
    this.actor = new AppRockskyActorNS(server);
    this.artist = new AppRockskyArtistNS(server);
    this.stats = new AppRockskyStatsNS(server);
    this.player = new AppRockskyPlayerNS(server);
  }
}

export class AppRockskyShoutNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getAlbumShouts<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutGetAlbumShouts.QueryParams,
      AppRockskyShoutGetAlbumShouts.HandlerInput,
      AppRockskyShoutGetAlbumShouts.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.getAlbumShouts"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  reportShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutReportShout.QueryParams,
      AppRockskyShoutReportShout.HandlerInput,
      AppRockskyShoutReportShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.reportShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getTrackShouts<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutGetTrackShouts.QueryParams,
      AppRockskyShoutGetTrackShouts.HandlerInput,
      AppRockskyShoutGetTrackShouts.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.getTrackShouts"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  replyShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutReplyShout.QueryParams,
      AppRockskyShoutReplyShout.HandlerInput,
      AppRockskyShoutReplyShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.replyShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  removeShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutRemoveShout.QueryParams,
      AppRockskyShoutRemoveShout.HandlerInput,
      AppRockskyShoutRemoveShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.removeShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getProfileShouts<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutGetProfileShouts.QueryParams,
      AppRockskyShoutGetProfileShouts.HandlerInput,
      AppRockskyShoutGetProfileShouts.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.getProfileShouts"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getArtistShouts<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutGetArtistShouts.QueryParams,
      AppRockskyShoutGetArtistShouts.HandlerInput,
      AppRockskyShoutGetArtistShouts.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.getArtistShouts"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getShoutReplies<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutGetShoutReplies.QueryParams,
      AppRockskyShoutGetShoutReplies.HandlerInput,
      AppRockskyShoutGetShoutReplies.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.getShoutReplies"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  createShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyShoutCreateShout.QueryParams,
      AppRockskyShoutCreateShout.HandlerInput,
      AppRockskyShoutCreateShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.shout.createShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyScrobbleNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  createScrobble<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyScrobbleCreateScrobble.QueryParams,
      AppRockskyScrobbleCreateScrobble.HandlerInput,
      AppRockskyScrobbleCreateScrobble.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.scrobble.createScrobble"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getScrobbles<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyScrobbleGetScrobbles.QueryParams,
      AppRockskyScrobbleGetScrobbles.HandlerInput,
      AppRockskyScrobbleGetScrobbles.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.scrobble.getScrobbles"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getScrobble<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyScrobbleGetScrobble.QueryParams,
      AppRockskyScrobbleGetScrobble.HandlerInput,
      AppRockskyScrobbleGetScrobble.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.scrobble.getScrobble"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyLikeNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  dislikeShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyLikeDislikeShout.QueryParams,
      AppRockskyLikeDislikeShout.HandlerInput,
      AppRockskyLikeDislikeShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.like.dislikeShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  likeSong<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyLikeLikeSong.QueryParams,
      AppRockskyLikeLikeSong.HandlerInput,
      AppRockskyLikeLikeSong.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.like.likeSong"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  dislikeSong<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyLikeDislikeSong.QueryParams,
      AppRockskyLikeDislikeSong.HandlerInput,
      AppRockskyLikeDislikeSong.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.like.dislikeSong"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  likeShout<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyLikeLikeShout.QueryParams,
      AppRockskyLikeLikeShout.HandlerInput,
      AppRockskyLikeLikeShout.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.like.likeShout"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyPlaylistNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  createPlaylist<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistCreatePlaylist.QueryParams,
      AppRockskyPlaylistCreatePlaylist.HandlerInput,
      AppRockskyPlaylistCreatePlaylist.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.createPlaylist"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  startPlaylist<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistStartPlaylist.QueryParams,
      AppRockskyPlaylistStartPlaylist.HandlerInput,
      AppRockskyPlaylistStartPlaylist.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.startPlaylist"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getPlaylists<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistGetPlaylists.QueryParams,
      AppRockskyPlaylistGetPlaylists.HandlerInput,
      AppRockskyPlaylistGetPlaylists.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.getPlaylists"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  insertDirectory<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistInsertDirectory.QueryParams,
      AppRockskyPlaylistInsertDirectory.HandlerInput,
      AppRockskyPlaylistInsertDirectory.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.insertDirectory"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  removeTrack<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistRemoveTrack.QueryParams,
      AppRockskyPlaylistRemoveTrack.HandlerInput,
      AppRockskyPlaylistRemoveTrack.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.removeTrack"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  removePlaylist<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistRemovePlaylist.QueryParams,
      AppRockskyPlaylistRemovePlaylist.HandlerInput,
      AppRockskyPlaylistRemovePlaylist.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.removePlaylist"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  insertFiles<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistInsertFiles.QueryParams,
      AppRockskyPlaylistInsertFiles.HandlerInput,
      AppRockskyPlaylistInsertFiles.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.insertFiles"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getPlaylist<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlaylistGetPlaylist.QueryParams,
      AppRockskyPlaylistGetPlaylist.HandlerInput,
      AppRockskyPlaylistGetPlaylist.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.playlist.getPlaylist"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskySpotifyNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  seek<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifySeek.QueryParams,
      AppRockskySpotifySeek.HandlerInput,
      AppRockskySpotifySeek.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.seek"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  next<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifyNext.QueryParams,
      AppRockskySpotifyNext.HandlerInput,
      AppRockskySpotifyNext.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.next"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getCurrentlyPlaying<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifyGetCurrentlyPlaying.QueryParams,
      AppRockskySpotifyGetCurrentlyPlaying.HandlerInput,
      AppRockskySpotifyGetCurrentlyPlaying.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.getCurrentlyPlaying"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  previous<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifyPrevious.QueryParams,
      AppRockskySpotifyPrevious.HandlerInput,
      AppRockskySpotifyPrevious.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.previous"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  pause<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifyPause.QueryParams,
      AppRockskySpotifyPause.HandlerInput,
      AppRockskySpotifyPause.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.pause"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  play<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySpotifyPlay.QueryParams,
      AppRockskySpotifyPlay.HandlerInput,
      AppRockskySpotifyPlay.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.spotify.play"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyChartsNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getScrobblesChart<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyChartsGetScrobblesChart.QueryParams,
      AppRockskyChartsGetScrobblesChart.HandlerInput,
      AppRockskyChartsGetScrobblesChart.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.charts.getScrobblesChart"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskySongNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getSongs<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySongGetSongs.QueryParams,
      AppRockskySongGetSongs.HandlerInput,
      AppRockskySongGetSongs.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.song.getSongs"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getSong<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySongGetSong.QueryParams,
      AppRockskySongGetSong.HandlerInput,
      AppRockskySongGetSong.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.song.getSong"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  createSong<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskySongCreateSong.QueryParams,
      AppRockskySongCreateSong.HandlerInput,
      AppRockskySongCreateSong.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.song.createSong"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyApikeyNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getApikeys<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyApikeyGetApikeys.QueryParams,
      AppRockskyApikeyGetApikeys.HandlerInput,
      AppRockskyApikeyGetApikeys.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.apikey.getApikeys"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  updateApikey<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyApikeyUpdateApikey.QueryParams,
      AppRockskyApikeyUpdateApikey.HandlerInput,
      AppRockskyApikeyUpdateApikey.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.apikey.updateApikey"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  createApikey<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyApikeyCreateApikey.QueryParams,
      AppRockskyApikeyCreateApikey.HandlerInput,
      AppRockskyApikeyCreateApikey.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.apikey.createApikey"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  removeApikey<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyApikeyRemoveApikey.QueryParams,
      AppRockskyApikeyRemoveApikey.HandlerInput,
      AppRockskyApikeyRemoveApikey.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.apikey.removeApikey"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyFeedNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getFeedGenerators<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedGetFeedGenerators.QueryParams,
      AppRockskyFeedGetFeedGenerators.HandlerInput,
      AppRockskyFeedGetFeedGenerators.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.getFeedGenerators"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getFeedGenerator<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedGetFeedGenerator.QueryParams,
      AppRockskyFeedGetFeedGenerator.HandlerInput,
      AppRockskyFeedGetFeedGenerator.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.getFeedGenerator"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  search<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedSearch.QueryParams,
      AppRockskyFeedSearch.HandlerInput,
      AppRockskyFeedSearch.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.search"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getNowPlayings<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedGetNowPlayings.QueryParams,
      AppRockskyFeedGetNowPlayings.HandlerInput,
      AppRockskyFeedGetNowPlayings.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.getNowPlayings"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  describeFeedGenerator<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedDescribeFeedGenerator.QueryParams,
      AppRockskyFeedDescribeFeedGenerator.HandlerInput,
      AppRockskyFeedDescribeFeedGenerator.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.describeFeedGenerator"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getFeed<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedGetFeed.QueryParams,
      AppRockskyFeedGetFeed.HandlerInput,
      AppRockskyFeedGetFeed.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.getFeed"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getFeedSkeleton<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyFeedGetFeedSkeleton.QueryParams,
      AppRockskyFeedGetFeedSkeleton.HandlerInput,
      AppRockskyFeedGetFeedSkeleton.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.feed.getFeedSkeleton"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyDropboxNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  downloadFile<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyDropboxDownloadFile.QueryParams,
      AppRockskyDropboxDownloadFile.HandlerInput,
      AppRockskyDropboxDownloadFile.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.dropbox.downloadFile"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getFiles<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyDropboxGetFiles.QueryParams,
      AppRockskyDropboxGetFiles.HandlerInput,
      AppRockskyDropboxGetFiles.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.dropbox.getFiles"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getMetadata<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyDropboxGetMetadata.QueryParams,
      AppRockskyDropboxGetMetadata.HandlerInput,
      AppRockskyDropboxGetMetadata.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.dropbox.getMetadata"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getTemporaryLink<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyDropboxGetTemporaryLink.QueryParams,
      AppRockskyDropboxGetTemporaryLink.HandlerInput,
      AppRockskyDropboxGetTemporaryLink.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.dropbox.getTemporaryLink"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyGoogledriveNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getFile<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyGoogledriveGetFile.QueryParams,
      AppRockskyGoogledriveGetFile.HandlerInput,
      AppRockskyGoogledriveGetFile.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.googledrive.getFile"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  downloadFile<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyGoogledriveDownloadFile.QueryParams,
      AppRockskyGoogledriveDownloadFile.HandlerInput,
      AppRockskyGoogledriveDownloadFile.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.googledrive.downloadFile"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getFiles<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyGoogledriveGetFiles.QueryParams,
      AppRockskyGoogledriveGetFiles.HandlerInput,
      AppRockskyGoogledriveGetFiles.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.googledrive.getFiles"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyAlbumNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getAlbumTracks<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyAlbumGetAlbumTracks.QueryParams,
      AppRockskyAlbumGetAlbumTracks.HandlerInput,
      AppRockskyAlbumGetAlbumTracks.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.album.getAlbumTracks"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getAlbum<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyAlbumGetAlbum.QueryParams,
      AppRockskyAlbumGetAlbum.HandlerInput,
      AppRockskyAlbumGetAlbum.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.album.getAlbum"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getAlbums<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyAlbumGetAlbums.QueryParams,
      AppRockskyAlbumGetAlbums.HandlerInput,
      AppRockskyAlbumGetAlbums.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.album.getAlbums"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyActorNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getActorPlaylists<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorPlaylists.QueryParams,
      AppRockskyActorGetActorPlaylists.HandlerInput,
      AppRockskyActorGetActorPlaylists.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorPlaylists"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getActorSongs<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorSongs.QueryParams,
      AppRockskyActorGetActorSongs.HandlerInput,
      AppRockskyActorGetActorSongs.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorSongs"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getActorArtists<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorArtists.QueryParams,
      AppRockskyActorGetActorArtists.HandlerInput,
      AppRockskyActorGetActorArtists.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorArtists"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getProfile<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetProfile.QueryParams,
      AppRockskyActorGetProfile.HandlerInput,
      AppRockskyActorGetProfile.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getProfile"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getActorLovedSongs<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorLovedSongs.QueryParams,
      AppRockskyActorGetActorLovedSongs.HandlerInput,
      AppRockskyActorGetActorLovedSongs.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorLovedSongs"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getActorAlbums<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorAlbums.QueryParams,
      AppRockskyActorGetActorAlbums.HandlerInput,
      AppRockskyActorGetActorAlbums.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorAlbums"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getActorScrobbles<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyActorGetActorScrobbles.QueryParams,
      AppRockskyActorGetActorScrobbles.HandlerInput,
      AppRockskyActorGetActorScrobbles.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.actor.getActorScrobbles"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyArtistNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getArtistAlbums<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyArtistGetArtistAlbums.QueryParams,
      AppRockskyArtistGetArtistAlbums.HandlerInput,
      AppRockskyArtistGetArtistAlbums.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.artist.getArtistAlbums"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getArtistListeners<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyArtistGetArtistListeners.QueryParams,
      AppRockskyArtistGetArtistListeners.HandlerInput,
      AppRockskyArtistGetArtistListeners.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.artist.getArtistListeners"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getArtists<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyArtistGetArtists.QueryParams,
      AppRockskyArtistGetArtists.HandlerInput,
      AppRockskyArtistGetArtists.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.artist.getArtists"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getArtist<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyArtistGetArtist.QueryParams,
      AppRockskyArtistGetArtist.HandlerInput,
      AppRockskyArtistGetArtist.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.artist.getArtist"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getArtistTracks<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyArtistGetArtistTracks.QueryParams,
      AppRockskyArtistGetArtistTracks.HandlerInput,
      AppRockskyArtistGetArtistTracks.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.artist.getArtistTracks"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyStatsNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  getStats<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyStatsGetStats.QueryParams,
      AppRockskyStatsGetStats.HandlerInput,
      AppRockskyStatsGetStats.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.stats.getStats"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppRockskyPlayerNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }

  seek<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerSeek.QueryParams,
      AppRockskyPlayerSeek.HandlerInput,
      AppRockskyPlayerSeek.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.seek"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getPlaybackQueue<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerGetPlaybackQueue.QueryParams,
      AppRockskyPlayerGetPlaybackQueue.HandlerInput,
      AppRockskyPlayerGetPlaybackQueue.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.getPlaybackQueue"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  next<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerNext.QueryParams,
      AppRockskyPlayerNext.HandlerInput,
      AppRockskyPlayerNext.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.next"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  playFile<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerPlayFile.QueryParams,
      AppRockskyPlayerPlayFile.HandlerInput,
      AppRockskyPlayerPlayFile.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.playFile"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  getCurrentlyPlaying<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerGetCurrentlyPlaying.QueryParams,
      AppRockskyPlayerGetCurrentlyPlaying.HandlerInput,
      AppRockskyPlayerGetCurrentlyPlaying.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.getCurrentlyPlaying"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  previous<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerPrevious.QueryParams,
      AppRockskyPlayerPrevious.HandlerInput,
      AppRockskyPlayerPrevious.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.previous"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  addItemsToQueue<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerAddItemsToQueue.QueryParams,
      AppRockskyPlayerAddItemsToQueue.HandlerInput,
      AppRockskyPlayerAddItemsToQueue.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.addItemsToQueue"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  pause<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerPause.QueryParams,
      AppRockskyPlayerPause.HandlerInput,
      AppRockskyPlayerPause.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.pause"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  play<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerPlay.QueryParams,
      AppRockskyPlayerPlay.HandlerInput,
      AppRockskyPlayerPlay.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.play"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  playDirectory<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerPlayDirectory.QueryParams,
      AppRockskyPlayerPlayDirectory.HandlerInput,
      AppRockskyPlayerPlayDirectory.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.playDirectory"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }

  addDirectoryToQueue<A extends Auth = void>(
    cfg: MethodConfigOrHandler<
      A,
      AppRockskyPlayerAddDirectoryToQueue.QueryParams,
      AppRockskyPlayerAddDirectoryToQueue.HandlerInput,
      AppRockskyPlayerAddDirectoryToQueue.HandlerOutput
    >,
  ) {
    const nsid = "app.rocksky.player.addDirectoryToQueue"; // @ts-ignore - dynamically generated
    return this._server.xrpc.method(nsid, cfg);
  }
}

export class AppBskyNS {
  _server: Server;
  actor: AppBskyActorNS;

  constructor(server: Server) {
    this._server = server;
    this.actor = new AppBskyActorNS(server);
  }
}

export class AppBskyActorNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}
