import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.album.getAlbumTracks({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
