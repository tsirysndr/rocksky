import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.apikey.createApikey({
    handler: async ({ input }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
