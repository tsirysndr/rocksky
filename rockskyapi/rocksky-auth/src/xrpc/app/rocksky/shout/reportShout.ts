import { Server } from "lexicon";

export default function (server: Server) {
  server.app.rocksky.shout.reportShout({
    handler: async ({ params }) => {
      return {
        encoding: "application/json",
        body: {},
      };
    },
  });
}
