import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.actor.getActorScrobbes({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
