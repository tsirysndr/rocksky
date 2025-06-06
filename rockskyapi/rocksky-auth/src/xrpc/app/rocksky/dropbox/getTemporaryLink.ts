import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.dropbox.getTemporaryLink({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
