import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.spotify.getCurrentlyPlaying({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
