import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.player.seek({
    handler: async ({ params }) => {},
  });
}
