import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.actor.getActorPlayists({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
