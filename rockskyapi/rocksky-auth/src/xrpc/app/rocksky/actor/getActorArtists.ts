import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.actor.getActorArtists({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
