import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.apikey.updateApikey({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
