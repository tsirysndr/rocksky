import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.spotify.pause({
    handler: async ({ params }) => {},
  });
}
