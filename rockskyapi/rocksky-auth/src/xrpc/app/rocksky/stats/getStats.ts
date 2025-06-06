import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.stats.getStats({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
