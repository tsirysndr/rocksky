import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.scrobble.getScrobble({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
