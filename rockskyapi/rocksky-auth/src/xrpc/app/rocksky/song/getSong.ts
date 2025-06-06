import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.song.getSong({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
