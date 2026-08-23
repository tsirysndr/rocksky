import type { Context } from "context";
import { onPlaylistImport, onPlaylistIndexed } from "./playlist";
import { onNewTrack } from "./track";
import { onNewUser } from "./user";
import { onNewScrobble } from "./scrobble";
import { onSongChanged, onSongStopped } from "./status";

export default function subscribe(ctx: Context) {
  onPlaylistImport(ctx);
  onPlaylistIndexed(ctx);
  onNewTrack(ctx);
  onNewUser(ctx);
  onNewScrobble(ctx);
  onSongChanged(ctx);
  onSongStopped(ctx);
}
