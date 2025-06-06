import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.player.pause({
    handler: async ({ params }) => {},
  });
}
