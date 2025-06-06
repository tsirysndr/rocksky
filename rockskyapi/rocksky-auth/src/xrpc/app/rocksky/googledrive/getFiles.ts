import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.googledrive.getFiles({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
