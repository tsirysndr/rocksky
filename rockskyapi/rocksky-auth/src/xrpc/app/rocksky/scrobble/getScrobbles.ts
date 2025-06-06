import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.scrobble.getScrobbles({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
