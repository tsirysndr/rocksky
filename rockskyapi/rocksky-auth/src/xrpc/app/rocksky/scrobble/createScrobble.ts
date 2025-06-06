import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.scrobble.createScrobble({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
