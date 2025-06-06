import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.spotify.play({
    handler: async ({ params }) => {},
  });
}
