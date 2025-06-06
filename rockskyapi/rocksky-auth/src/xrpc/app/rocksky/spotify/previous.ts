import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.spotify.previous({
    handler: async ({ params }) => {},
  });
}
