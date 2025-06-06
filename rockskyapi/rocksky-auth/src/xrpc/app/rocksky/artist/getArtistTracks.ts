import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.artist.getArtistTracks({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
