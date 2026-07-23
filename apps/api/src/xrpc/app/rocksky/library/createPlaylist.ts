import type { Context } from "context";
import type { Server } from "lexicon";
import { proxyMethod } from "lib/navidrome";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.library.createPlaylist(
    proxyMethod(ctx, "createPlaylist", { source: "input" }),
  );
}
