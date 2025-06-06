import { Server } from "lexicon";
import getActorAlbums from "./app/rocksky/actor/getActorAlbums";
import getActorArtists from "./app/rocksky/actor/getActorArtists";
import getActorLovedSongs from "./app/rocksky/actor/getActorLovedSongs";
import getActorPlaylists from "./app/rocksky/actor/getActorPlaylists";
import getActorScrobbles from "./app/rocksky/actor/getActorScrobbles";
import getActorSongs from "./app/rocksky/actor/getActorSongs";
import getProfile from "./app/rocksky/actor/getProfile";
import getAlbum from "./app/rocksky/album/getAlbum";

export default function (server: Server) {
  // app.rocksky
  getActorAlbums(server);
  getActorArtists(server);
  getActorLovedSongs(server);
  getActorPlaylists(server);
  getActorScrobbles(server);
  getActorSongs(server);
  getProfile(server);

  getAlbum(server);

  return server;
}
