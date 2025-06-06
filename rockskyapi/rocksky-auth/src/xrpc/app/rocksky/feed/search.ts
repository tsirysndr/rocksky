import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.feed.search({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
