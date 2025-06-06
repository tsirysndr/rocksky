import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.playlist.getPlaylist({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
