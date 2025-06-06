import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.shout.getArtistShouts({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
