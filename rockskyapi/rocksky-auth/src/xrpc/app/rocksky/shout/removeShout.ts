import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.shout.removeShout({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
