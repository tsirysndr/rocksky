import { Context } from "context";
import { onNewPlaylist } from "./playlist";
import { onNewTrack } from "./track";
import { onNewUser } from "./user";

export default function subscribe(ctx: Context) {
  onNewPlaylist(ctx);
  onNewTrack(ctx);
  onNewUser(ctx);
}
