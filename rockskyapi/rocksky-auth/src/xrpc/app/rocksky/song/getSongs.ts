import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.song.getSongs({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
