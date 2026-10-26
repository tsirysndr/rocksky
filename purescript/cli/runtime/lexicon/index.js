import {
  createServer as createXrpcServer
} from "@atproto/xrpc-server";
import { schemas } from "./lexicons.js";
function createServer(options) {
  return new Server(options);
}
class Server {
  xrpc;
  app;
  com;
  constructor(options) {
    this.xrpc = createXrpcServer(schemas, options);
    this.app = new AppNS(this);
    this.com = new ComNS(this);
  }
}
class AppNS {
  _server;
  rocksky;
  bsky;
  constructor(server) {
    this._server = server;
    this.rocksky = new AppRockskyNS(server);
    this.bsky = new AppBskyNS(server);
  }
}
class AppRockskyNS {
  _server;
  actor;
  album;
  apikey;
  artist;
  charts;
  dropbox;
  feed;
  googledrive;
  graph;
  like;
  player;
  playlist;
  scrobble;
  shout;
  song;
  spotify;
  stats;
  constructor(server) {
    this._server = server;
    this.actor = new AppRockskyActorNS(server);
    this.album = new AppRockskyAlbumNS(server);
    this.apikey = new AppRockskyApikeyNS(server);
    this.artist = new AppRockskyArtistNS(server);
    this.charts = new AppRockskyChartsNS(server);
    this.dropbox = new AppRockskyDropboxNS(server);
    this.feed = new AppRockskyFeedNS(server);
    this.googledrive = new AppRockskyGoogledriveNS(server);
    this.graph = new AppRockskyGraphNS(server);
    this.like = new AppRockskyLikeNS(server);
    this.player = new AppRockskyPlayerNS(server);
    this.playlist = new AppRockskyPlaylistNS(server);
    this.scrobble = new AppRockskyScrobbleNS(server);
    this.shout = new AppRockskyShoutNS(server);
    this.song = new AppRockskySongNS(server);
    this.spotify = new AppRockskySpotifyNS(server);
    this.stats = new AppRockskyStatsNS(server);
  }
}
class AppRockskyActorNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getActorAlbums(cfg) {
    const nsid = "app.rocksky.actor.getActorAlbums";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorArtists(cfg) {
    const nsid = "app.rocksky.actor.getActorArtists";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorCompatibility(cfg) {
    const nsid = "app.rocksky.actor.getActorCompatibility";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorLovedSongs(cfg) {
    const nsid = "app.rocksky.actor.getActorLovedSongs";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorNeighbours(cfg) {
    const nsid = "app.rocksky.actor.getActorNeighbours";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorPlaylists(cfg) {
    const nsid = "app.rocksky.actor.getActorPlaylists";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorScrobbles(cfg) {
    const nsid = "app.rocksky.actor.getActorScrobbles";
    return this._server.xrpc.method(nsid, cfg);
  }
  getActorSongs(cfg) {
    const nsid = "app.rocksky.actor.getActorSongs";
    return this._server.xrpc.method(nsid, cfg);
  }
  getProfile(cfg) {
    const nsid = "app.rocksky.actor.getProfile";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyAlbumNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getAlbum(cfg) {
    const nsid = "app.rocksky.album.getAlbum";
    return this._server.xrpc.method(nsid, cfg);
  }
  getAlbums(cfg) {
    const nsid = "app.rocksky.album.getAlbums";
    return this._server.xrpc.method(nsid, cfg);
  }
  getAlbumTracks(cfg) {
    const nsid = "app.rocksky.album.getAlbumTracks";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyApikeyNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  createApikey(cfg) {
    const nsid = "app.rocksky.apikey.createApikey";
    return this._server.xrpc.method(nsid, cfg);
  }
  getApikeys(cfg) {
    const nsid = "app.rocksky.apikey.getApikeys";
    return this._server.xrpc.method(nsid, cfg);
  }
  removeApikey(cfg) {
    const nsid = "app.rocksky.apikey.removeApikey";
    return this._server.xrpc.method(nsid, cfg);
  }
  updateApikey(cfg) {
    const nsid = "app.rocksky.apikey.updateApikey";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyArtistNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getArtist(cfg) {
    const nsid = "app.rocksky.artist.getArtist";
    return this._server.xrpc.method(nsid, cfg);
  }
  getArtistAlbums(cfg) {
    const nsid = "app.rocksky.artist.getArtistAlbums";
    return this._server.xrpc.method(nsid, cfg);
  }
  getArtistListeners(cfg) {
    const nsid = "app.rocksky.artist.getArtistListeners";
    return this._server.xrpc.method(nsid, cfg);
  }
  getArtists(cfg) {
    const nsid = "app.rocksky.artist.getArtists";
    return this._server.xrpc.method(nsid, cfg);
  }
  getArtistTracks(cfg) {
    const nsid = "app.rocksky.artist.getArtistTracks";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyChartsNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getScrobblesChart(cfg) {
    const nsid = "app.rocksky.charts.getScrobblesChart";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyDropboxNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  downloadFile(cfg) {
    const nsid = "app.rocksky.dropbox.downloadFile";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFiles(cfg) {
    const nsid = "app.rocksky.dropbox.getFiles";
    return this._server.xrpc.method(nsid, cfg);
  }
  getMetadata(cfg) {
    const nsid = "app.rocksky.dropbox.getMetadata";
    return this._server.xrpc.method(nsid, cfg);
  }
  getTemporaryLink(cfg) {
    const nsid = "app.rocksky.dropbox.getTemporaryLink";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyFeedNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  describeFeedGenerator(cfg) {
    const nsid = "app.rocksky.feed.describeFeedGenerator";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFeed(cfg) {
    const nsid = "app.rocksky.feed.getFeed";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFeedGenerator(cfg) {
    const nsid = "app.rocksky.feed.getFeedGenerator";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFeedGenerators(cfg) {
    const nsid = "app.rocksky.feed.getFeedGenerators";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFeedSkeleton(cfg) {
    const nsid = "app.rocksky.feed.getFeedSkeleton";
    return this._server.xrpc.method(nsid, cfg);
  }
  getNowPlayings(cfg) {
    const nsid = "app.rocksky.feed.getNowPlayings";
    return this._server.xrpc.method(nsid, cfg);
  }
  search(cfg) {
    const nsid = "app.rocksky.feed.search";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyGoogledriveNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  downloadFile(cfg) {
    const nsid = "app.rocksky.googledrive.downloadFile";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFile(cfg) {
    const nsid = "app.rocksky.googledrive.getFile";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFiles(cfg) {
    const nsid = "app.rocksky.googledrive.getFiles";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyGraphNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  followAccount(cfg) {
    const nsid = "app.rocksky.graph.followAccount";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFollowers(cfg) {
    const nsid = "app.rocksky.graph.getFollowers";
    return this._server.xrpc.method(nsid, cfg);
  }
  getFollows(cfg) {
    const nsid = "app.rocksky.graph.getFollows";
    return this._server.xrpc.method(nsid, cfg);
  }
  getKnownFollowers(cfg) {
    const nsid = "app.rocksky.graph.getKnownFollowers";
    return this._server.xrpc.method(nsid, cfg);
  }
  unfollowAccount(cfg) {
    const nsid = "app.rocksky.graph.unfollowAccount";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyLikeNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  dislikeShout(cfg) {
    const nsid = "app.rocksky.like.dislikeShout";
    return this._server.xrpc.method(nsid, cfg);
  }
  dislikeSong(cfg) {
    const nsid = "app.rocksky.like.dislikeSong";
    return this._server.xrpc.method(nsid, cfg);
  }
  likeShout(cfg) {
    const nsid = "app.rocksky.like.likeShout";
    return this._server.xrpc.method(nsid, cfg);
  }
  likeSong(cfg) {
    const nsid = "app.rocksky.like.likeSong";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyPlayerNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  addDirectoryToQueue(cfg) {
    const nsid = "app.rocksky.player.addDirectoryToQueue";
    return this._server.xrpc.method(nsid, cfg);
  }
  addItemsToQueue(cfg) {
    const nsid = "app.rocksky.player.addItemsToQueue";
    return this._server.xrpc.method(nsid, cfg);
  }
  getCurrentlyPlaying(cfg) {
    const nsid = "app.rocksky.player.getCurrentlyPlaying";
    return this._server.xrpc.method(nsid, cfg);
  }
  getPlaybackQueue(cfg) {
    const nsid = "app.rocksky.player.getPlaybackQueue";
    return this._server.xrpc.method(nsid, cfg);
  }
  next(cfg) {
    const nsid = "app.rocksky.player.next";
    return this._server.xrpc.method(nsid, cfg);
  }
  pause(cfg) {
    const nsid = "app.rocksky.player.pause";
    return this._server.xrpc.method(nsid, cfg);
  }
  play(cfg) {
    const nsid = "app.rocksky.player.play";
    return this._server.xrpc.method(nsid, cfg);
  }
  playDirectory(cfg) {
    const nsid = "app.rocksky.player.playDirectory";
    return this._server.xrpc.method(nsid, cfg);
  }
  playFile(cfg) {
    const nsid = "app.rocksky.player.playFile";
    return this._server.xrpc.method(nsid, cfg);
  }
  previous(cfg) {
    const nsid = "app.rocksky.player.previous";
    return this._server.xrpc.method(nsid, cfg);
  }
  seek(cfg) {
    const nsid = "app.rocksky.player.seek";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyPlaylistNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  createPlaylist(cfg) {
    const nsid = "app.rocksky.playlist.createPlaylist";
    return this._server.xrpc.method(nsid, cfg);
  }
  getPlaylist(cfg) {
    const nsid = "app.rocksky.playlist.getPlaylist";
    return this._server.xrpc.method(nsid, cfg);
  }
  getPlaylists(cfg) {
    const nsid = "app.rocksky.playlist.getPlaylists";
    return this._server.xrpc.method(nsid, cfg);
  }
  insertDirectory(cfg) {
    const nsid = "app.rocksky.playlist.insertDirectory";
    return this._server.xrpc.method(nsid, cfg);
  }
  insertFiles(cfg) {
    const nsid = "app.rocksky.playlist.insertFiles";
    return this._server.xrpc.method(nsid, cfg);
  }
  removePlaylist(cfg) {
    const nsid = "app.rocksky.playlist.removePlaylist";
    return this._server.xrpc.method(nsid, cfg);
  }
  removeTrack(cfg) {
    const nsid = "app.rocksky.playlist.removeTrack";
    return this._server.xrpc.method(nsid, cfg);
  }
  startPlaylist(cfg) {
    const nsid = "app.rocksky.playlist.startPlaylist";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyScrobbleNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  createScrobble(cfg) {
    const nsid = "app.rocksky.scrobble.createScrobble";
    return this._server.xrpc.method(nsid, cfg);
  }
  getScrobble(cfg) {
    const nsid = "app.rocksky.scrobble.getScrobble";
    return this._server.xrpc.method(nsid, cfg);
  }
  getScrobbles(cfg) {
    const nsid = "app.rocksky.scrobble.getScrobbles";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyShoutNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  createShout(cfg) {
    const nsid = "app.rocksky.shout.createShout";
    return this._server.xrpc.method(nsid, cfg);
  }
  getAlbumShouts(cfg) {
    const nsid = "app.rocksky.shout.getAlbumShouts";
    return this._server.xrpc.method(nsid, cfg);
  }
  getArtistShouts(cfg) {
    const nsid = "app.rocksky.shout.getArtistShouts";
    return this._server.xrpc.method(nsid, cfg);
  }
  getProfileShouts(cfg) {
    const nsid = "app.rocksky.shout.getProfileShouts";
    return this._server.xrpc.method(nsid, cfg);
  }
  getShoutReplies(cfg) {
    const nsid = "app.rocksky.shout.getShoutReplies";
    return this._server.xrpc.method(nsid, cfg);
  }
  getTrackShouts(cfg) {
    const nsid = "app.rocksky.shout.getTrackShouts";
    return this._server.xrpc.method(nsid, cfg);
  }
  removeShout(cfg) {
    const nsid = "app.rocksky.shout.removeShout";
    return this._server.xrpc.method(nsid, cfg);
  }
  replyShout(cfg) {
    const nsid = "app.rocksky.shout.replyShout";
    return this._server.xrpc.method(nsid, cfg);
  }
  reportShout(cfg) {
    const nsid = "app.rocksky.shout.reportShout";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskySongNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  createSong(cfg) {
    const nsid = "app.rocksky.song.createSong";
    return this._server.xrpc.method(nsid, cfg);
  }
  getSong(cfg) {
    const nsid = "app.rocksky.song.getSong";
    return this._server.xrpc.method(nsid, cfg);
  }
  getSongs(cfg) {
    const nsid = "app.rocksky.song.getSongs";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskySpotifyNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getCurrentlyPlaying(cfg) {
    const nsid = "app.rocksky.spotify.getCurrentlyPlaying";
    return this._server.xrpc.method(nsid, cfg);
  }
  next(cfg) {
    const nsid = "app.rocksky.spotify.next";
    return this._server.xrpc.method(nsid, cfg);
  }
  pause(cfg) {
    const nsid = "app.rocksky.spotify.pause";
    return this._server.xrpc.method(nsid, cfg);
  }
  play(cfg) {
    const nsid = "app.rocksky.spotify.play";
    return this._server.xrpc.method(nsid, cfg);
  }
  previous(cfg) {
    const nsid = "app.rocksky.spotify.previous";
    return this._server.xrpc.method(nsid, cfg);
  }
  seek(cfg) {
    const nsid = "app.rocksky.spotify.seek";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppRockskyStatsNS {
  _server;
  constructor(server) {
    this._server = server;
  }
  getStats(cfg) {
    const nsid = "app.rocksky.stats.getStats";
    return this._server.xrpc.method(nsid, cfg);
  }
}
class AppBskyNS {
  _server;
  actor;
  constructor(server) {
    this._server = server;
    this.actor = new AppBskyActorNS(server);
  }
}
class AppBskyActorNS {
  _server;
  constructor(server) {
    this._server = server;
  }
}
class ComNS {
  _server;
  atproto;
  constructor(server) {
    this._server = server;
    this.atproto = new ComAtprotoNS(server);
  }
}
class ComAtprotoNS {
  _server;
  repo;
  constructor(server) {
    this._server = server;
    this.repo = new ComAtprotoRepoNS(server);
  }
}
class ComAtprotoRepoNS {
  _server;
  constructor(server) {
    this._server = server;
  }
}
export {
  AppBskyActorNS,
  AppBskyNS,
  AppNS,
  AppRockskyActorNS,
  AppRockskyAlbumNS,
  AppRockskyApikeyNS,
  AppRockskyArtistNS,
  AppRockskyChartsNS,
  AppRockskyDropboxNS,
  AppRockskyFeedNS,
  AppRockskyGoogledriveNS,
  AppRockskyGraphNS,
  AppRockskyLikeNS,
  AppRockskyNS,
  AppRockskyPlayerNS,
  AppRockskyPlaylistNS,
  AppRockskyScrobbleNS,
  AppRockskyShoutNS,
  AppRockskySongNS,
  AppRockskySpotifyNS,
  AppRockskyStatsNS,
  ComAtprotoNS,
  ComAtprotoRepoNS,
  ComNS,
  Server,
  createServer
};
