import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.googledrive.getFile({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
