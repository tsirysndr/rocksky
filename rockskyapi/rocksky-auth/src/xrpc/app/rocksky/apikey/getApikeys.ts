import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.apikey.getApikeys({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
