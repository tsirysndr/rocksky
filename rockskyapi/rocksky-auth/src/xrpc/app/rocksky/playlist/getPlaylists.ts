import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.playlist.getPlaylists({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
