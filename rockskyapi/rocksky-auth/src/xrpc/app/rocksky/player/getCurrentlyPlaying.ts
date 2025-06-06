import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.player.getCurrentlyPlaying({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
