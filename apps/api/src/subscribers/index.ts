import { Context } from "context";
import { onNewPlaylist } from "./playlist";

export default function subscribe(ctx: Context) {
  onNewPlaylist(ctx);
}
