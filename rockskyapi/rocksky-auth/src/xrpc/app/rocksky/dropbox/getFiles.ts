import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.dropbox.getFiles({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
