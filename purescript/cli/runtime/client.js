import * as Client from '../../output/Rocksky.Cli.Client/index.js';
import { fromAff } from '../../output/Control.Promise/index.js';
export const ROCKSKY_API_URL = Client.apiUrl;
const run = action => fromAff(action)();
export class RockskyClient {
  constructor(token = '') { this.client = Client.new(token); }
}
for (const name of ['getCurrentUser','getApiKeys','getStreamToken']) {
  RockskyClient.prototype[name] = function () { return run(Client[name](this.client)); };
}
for (const name of ['getSpotifyNowPlaying','getNowPlaying','stats','getStats','deleteUploadByTrack','likeSong','dislikeSong']) {
  RockskyClient.prototype[name] = function (value = '') { return run(Client[name](this.client)(value)); };
}
for (const name of ['getUploads','getUploadAlbums','getUploadArtists','getGlobalScrobbles','deleteUploadAlbum','scrobbleNowPlaying']) {
  RockskyClient.prototype[name] = function (options = {}) { return run(Client[name](this.client)(options)); };
}
for (const name of ['scrobbles','search','getArtists','getAlbums','getTracks','getActorScrobbles','getActorSongs','getLovedSongs','getActorArtists','getActorAlbums']) {
  RockskyClient.prototype[name] = function (did = '', options = {}) { return run(Client[name](this.client)(did)(options)); };
}
RockskyClient.prototype.createApiKey = function(name, description = '') { return run(Client.createApiKey(this.client)(name)(description)); };
RockskyClient.prototype.matchSong = function(title, artist, album = '') { return run(Client.matchSong(this.client)(title)(artist)(album)); };
RockskyClient.prototype.streamUrl = function(id, token) { return Client.streamUrl(id)(token); };
RockskyClient.prototype.scrobble = function(apiKey, apiSig, title, artist, timestamp = 0) { return run(Client.legacyScrobble(this.client)(apiKey)(apiSig)(title)(artist)(Number(timestamp))); };
