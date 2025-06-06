import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.actor.getActorLovedSongs({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
